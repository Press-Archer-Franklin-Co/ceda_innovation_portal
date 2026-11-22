import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { Bold, Italic } from 'lucide-react'
import { cn } from '../../../lib/cn'
import { useT } from '../../../i18n/context'
import { MARK_TYPES, marksFromSegments, segments, toggleMark } from '../../../lib/content/headlineMarks'

// Figma 3.8 Home page editor (19:480), pin 3: one small rich text field. A toolbar inside the field's top edge
// has B, I and an amber "Highlight" button; the headline shows in the field as it will look. The value stays
// plain text plus marks (never HTML). Ctrl or Cmd+B and +I work too. English and Setswana each have their own.

const MARK_CLASS = { highlight: 'text-accent', bold: 'font-black', italic: 'italic' }

/** Draw the text and marks into the editable element (spans carry their marks in data-marks). */
function paint(el, text, marks) {
  el.replaceChildren(
    ...segments(text, marks).map((piece) => {
      if (!piece.types.length) return document.createTextNode(piece.text)
      const span = document.createElement('span')
      span.dataset.marks = piece.types.join(' ')
      span.className = piece.types.map((type) => MARK_CLASS[type]).join(' ')
      span.textContent = piece.text
      return span
    }),
  )
}

/** Read text and marks back from the element after the browser changed it (typing, deleting, pasting). */
function read(el) {
  const pieces = []
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const host = node.parentElement?.closest('[data-marks]')
    const types = host && el.contains(host) ? host.dataset.marks.split(' ').filter((type) => MARK_TYPES.includes(type)) : []
    pieces.push({ text: node.data.replace(/\n/g, ' '), types })
  }
  return { text: pieces.map((p) => p.text).join(''), marks: marksFromSegments(pieces) }
}

/** Character offset of a DOM point inside the element. */
function offsetOf(el, container, offset) {
  const range = document.createRange()
  range.selectNodeContents(el)
  range.setEnd(container, offset)
  return range.toString().length
}

function selectionIn(el) {
  const sel = window.getSelection()
  if (!sel || !sel.rangeCount) return null
  const range = sel.getRangeAt(0)
  if (!el.contains(range.startContainer) || !el.contains(range.endContainer)) return null
  return { start: offsetOf(el, range.startContainer, range.startOffset), end: offsetOf(el, range.endContainer, range.endOffset) }
}

/** Put the selection back at character offsets after repainting. */
function restore(el, start, end) {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
  const find = (target) => {
    let left = target
    let last = null
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      last = node
      if (left <= node.data.length) return [node, left]
      left -= node.data.length
    }
    return last ? [last, last.data.length] : [el, 0]
  }
  const [a, aOff] = find(start)
  walker.currentNode = el
  const [b, bOff] = find(end)
  const range = document.createRange()
  range.setStart(a, aOff)
  range.setEnd(b, bOff)
  const sel = window.getSelection()
  sel?.removeAllRanges()
  sel?.addRange(range)
}

/**
 * value: the headline in this language; marks: its marks. onChange(text, marks) on every edit.
 * `max` limits the headline's length, as the plain field did.
 */
export default function HeadlineEditor({ label, value = '', marks = [], onChange, max, required, hint, error, note }) {
  const t = useT()
  const ref = useRef(null)
  const last = useRef({ text: null, marks: null })
  const saved = useRef(null)
  const [focused, setFocused] = useState(false)
  const id = `headline-${useId().replace(/:/g, '')}`

  // Repaint only when the value came from outside (language switch, reset), so the caret stays put while typing.
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    if (last.current.text === value && JSON.stringify(last.current.marks) === JSON.stringify(marks)) return
    paint(el, value, marks)
    last.current = { text: value, marks }
  }, [value, marks])

  const emit = useCallback((text, next) => {
    last.current = { text, marks: next }
    onChange(text, next)
  }, [onChange])

  const onInput = () => {
    const el = ref.current
    const { text, marks: next } = read(el)
    const cut = max && text.length > max ? text.slice(0, max) : text
    const kept = next.map((m) => ({ ...m, end: Math.min(m.end, cut.length) })).filter((m) => m.end > m.start)
    if (cut !== text) {
      const sel = selectionIn(el)
      paint(el, cut, kept)
      restore(el, Math.min(sel?.start ?? cut.length, cut.length), Math.min(sel?.end ?? cut.length, cut.length))
    }
    emit(cut, kept)
  }

  const apply = (type) => {
    const el = ref.current
    const sel = selectionIn(el) ?? saved.current
    if (!sel || sel.start === sel.end) {
      el?.focus()
      return
    }
    const next = toggleMark(marks, sel.start, sel.end, type)
    paint(el, value, next)
    emit(value, next)
    el.focus()
    restore(el, Math.min(sel.start, sel.end), Math.max(sel.start, sel.end))
  }

  const onKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      return
    }
    if ((e.metaKey || e.ctrlKey) && !e.altKey) {
      const key = e.key.toLowerCase()
      if (key === 'b' || key === 'i') {
        e.preventDefault()
        apply(key === 'b' ? 'bold' : 'italic')
      }
    }
  }

  // Paste as plain text on one line.
  const onPaste = (e) => {
    e.preventDefault()
    const text = (e.clipboardData?.getData('text/plain') ?? '').replace(/\s+/g, ' ')
    document.execCommand('insertText', false, text)
  }

  // Remember the selection when focus moves to a toolbar button (mouse or Tab).
  const remember = () => {
    const el = ref.current
    if (el) saved.current = selectionIn(el) ?? saved.current
  }
  useEffect(() => {
    document.addEventListener('selectionchange', remember)
    return () => document.removeEventListener('selectionchange', remember)
  }, [])

  const tool = 'flex h-6 min-w-6 items-center justify-center rounded-[6px] text-text hover:bg-surface2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary'
  const hintId = `${id}-hint`
  const errorId = `${id}-error`
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <span id={`${id}-label`} className="text-[13px] font-bold leading-5 text-text">
        {label}
        {required && <span className="ml-0.5 text-primary" aria-hidden>*</span>}
      </span>
      <div
        className={cn(
          'flex flex-col gap-2 rounded-control bg-surface p-3 transition-[border-color,box-shadow] duration-150',
          error ? 'border-2 border-danger' : focused ? 'border-2 border-primary shadow-focus' : 'border-2 border-border',
        )}
      >
        <div role="toolbar" aria-label={t('home.headlineTools')} className="flex items-center gap-3">
          <button type="button" className={tool} aria-label={t('home.bold')} title={`${t('home.bold')} (Ctrl+B)`} onMouseDown={(e) => e.preventDefault()} onClick={() => apply('bold')}>
            <Bold size={16} aria-hidden />
          </button>
          <button type="button" className={tool} aria-label={t('home.italic')} title={`${t('home.italic')} (Ctrl+I)`} onMouseDown={(e) => e.preventDefault()} onClick={() => apply('italic')}>
            <Italic size={16} aria-hidden />
          </button>
          <button
            type="button"
            aria-label={t('home.highlightLabel')}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => apply('highlight')}
            className="inline-flex items-center gap-1 rounded-[6px] bg-warning-soft px-2 py-0.5 text-[12px] font-bold leading-4 text-warning hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <span aria-hidden className="h-2.5 w-2.5 rounded-full bg-amber" />
            {t('home.highlight')}
          </button>
        </div>
        <div
          ref={ref}
          id={id}
          role="textbox"
          aria-multiline="false"
          aria-labelledby={`${id}-label`}
          aria-describedby={[error ? errorId : null, hintId].filter(Boolean).join(' ')}
          aria-invalid={error ? true : undefined}
          aria-required={required || undefined}
          contentEditable
          suppressContentEditableWarning
          spellCheck
          data-testid="headline-editor"
          className="min-h-[22px] whitespace-pre-wrap break-words font-heading text-[15px] font-semibold leading-[22px] text-text outline-none focus-visible:ring-0 focus-visible:ring-offset-0"
          onInput={onInput}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
        />
      </div>
      {error && <p id={errorId} role="alert" className="text-d-cap text-danger">{error}</p>}
      <p id={hintId} className={note ? 'text-d-cap text-danger' : 'text-d-cap text-muted'}>{note || hint || t('home.highlightHint')}</p>
    </div>
  )
}
