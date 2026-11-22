import { useEffect, useRef, useState } from 'react'
import { Sparkles, X } from 'lucide-react'
import cn from 'clsx'
import Button from '../ui/Button'
import { useGuide } from './guideContext'
import type { GuideStep } from '../../lib/guide/guide'
import { scrollToTarget } from './guideContext'

// What the guide panel (website) and sheet (phone) show, from 3.40 and 2.14: the question, the numbered steps with
// a progress bar, Show me and Skip this step, "Ask another question" and "Talk to a person". When the guide
// cannot answer it says so in plain words, never a raw error.

export function GuideHeader({ titleId, onClose }: { titleId: string; onClose: () => void }) {
  const g = useGuide()
  return (
    <div className="flex items-center gap-2">
      <h2 id={titleId} className="flex-1 flex items-center gap-1.5 font-heading font-semibold text-[16px] leading-[22px] text-text">
        <Sparkles size={16} aria-hidden className="text-text" />
        {g.t('guide.title')}
      </h2>
      {g.app === 'public' && (
        <span className="flex items-center gap-1 text-[12px] font-bold text-muted" role="group" aria-label={g.t('guide.language')}>
          {['en', 'tn'].map((l, i) => (
            <span key={l} className="flex items-center gap-1">
              {i > 0 && <span aria-hidden>·</span>}
              <button type="button" onClick={() => g.setLang(l)} aria-pressed={g.lang === l} className={cn('uppercase rounded px-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary', g.lang === l ? 'text-text' : 'text-muted hover:text-text')}>
                {l}
              </button>
            </span>
          ))}
        </span>
      )}
      <button type="button" onClick={onClose} aria-label={g.t('guide.close')} className="w-8 h-8 -mr-1.5 grid place-items-center rounded-control text-muted hover:bg-surface2 hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
        <X size={18} aria-hidden />
      </button>
    </div>
  )
}

/** The steps as a bar of segments: finished and current ones filled. */
export function GuideProgress() {
  const g = useGuide()
  if (!g.steps.length) return null
  return (
    <div className="flex gap-1" role="progressbar" aria-valuemin={0} aria-valuemax={g.steps.length} aria-valuenow={Math.min(g.current + 1, g.steps.length)} aria-label={g.t('guide.progress')}>
      {g.steps.map((s: GuideStep, i: number) => (
        <span key={s.id} className={cn('h-[5px] flex-1 rounded-full', i <= g.current ? 'bg-primary' : 'bg-surface2')} />
      ))}
    </div>
  )
}

export function AskBox({ autoFocus = false, compact = false }: { autoFocus?: boolean; compact?: boolean }) {
  const g = useGuide()
  const [text, setText] = useState('')
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => { if (autoFocus) ref.current?.focus() }, [autoFocus])
  const first = g.status === 'idle'
  return (
    <form
      onSubmit={(e) => { e.preventDefault(); if (text.trim()) { g.ask(text); setText('') } }}
      className={cn('flex items-center gap-2 rounded-card bg-surface2 pl-3 pr-1.5 focus-within:ring-2 focus-within:ring-primary', compact ? 'h-10' : 'h-[42px]')}
    >
      <label className="sr-only" htmlFor="guide-ask">{first ? g.t('guide.askFirst') : g.t('guide.askAnother')}</label>
      <input
        ref={ref}
        id="guide-ask"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={first ? g.t('guide.askFirst') : g.t('guide.askAnother')}
        maxLength={500}
        autoComplete="off"
        className="flex-1 min-w-0 h-full !border-0 !bg-transparent !shadow-none !ring-0 p-0 text-[15px] text-text placeholder:text-muted focus:outline-none"
      />
      {text.trim() && <Button size="sm" type="submit" loading={g.status === 'asking'}>{g.t('guide.ask')}</Button>}
    </form>
  )
}

/** Show me (or Next), and the second button: Check my idea on the idea form (2.14), otherwise Skip this step. */
export function StepActions({ block = false }: { block?: boolean }) {
  const g = useGuide()
  if (g.status !== 'answered' || g.finished || !g.step) return null
  const check = g.app === 'public' ? g.findTarget('idea.check') : null
  const showMe = () => {
    g.setRingOn(true)
    const el = g.findTarget(g.step.targetId)
    if (el) { scrollToTarget(el); el.focus?.({ preventScroll: true }) }
  }
  const primary = g.step.targetId && !g.missing
    ? <Button data-guide-primary onClick={showMe} block={block} size="lg">{g.t('guide.showMe')}</Button>
    : <Button data-guide-primary onClick={g.next} block={block} size="lg">{g.t('guide.next')}</Button>
  return (
    <div className="flex gap-2">
      <div className={block ? 'flex-1' : ''}>{primary}</div>
      {check && !g.missing
        ? <Button variant="secondary" size="lg" onClick={() => check.click()}>{g.t('guide.checkIdea')}</Button>
        : <Button variant="secondary" size="lg" onClick={g.skip}>{g.t(block ? 'guide.skipShort' : 'guide.skip')}</Button>}
    </div>
  )
}

export function TalkLink({ inline = false }: { inline?: boolean }) {
  const g = useGuide()
  if (!g.canTalk) return null
  return (
    <button type="button" onClick={g.talk} className={cn('font-bold text-primary hover:underline underline-offset-2 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary', inline ? 'text-[13px]' : 'text-[14px] self-start')}>
      {g.t('guide.talk')}
    </button>
  )
}

/** The answer area: the page line, the question, then thinking, failed, the answer and its steps, or done. */
export function GuideAnswer({ list = true }: { list?: boolean }) {
  const g = useGuide()
  const pageTitle = typeof document !== 'undefined' ? (document.querySelector('main h1, h1')?.textContent || '').trim() : ''
  const intro = <p className="text-[13px] leading-[18px] text-muted">{pageTitle ? g.t('guide.youAreOn', { page: pageTitle }) : g.t('guide.intro')}</p>
  if (g.status === 'idle') return intro
  const answered = g.status === 'answered'
  return (
    <div className="flex flex-col gap-3">
      {list && !(g.status === 'answered' && g.guide?.answer) && intro}
      {g.question && list && (
        <p className="self-end max-w-[85%] rounded-control bg-primary px-3 py-2 text-[15px] leading-[22px] text-on-primary">{g.question}</p>
      )}
      <div aria-live="polite" className="flex flex-col gap-3">
        {g.status === 'asking' && <p className="text-[14px] text-muted">{g.t('guide.thinking')}</p>}
        {g.status === 'failed' && (
          <div className="rounded-control bg-warning-soft px-3 py-2.5 text-[14px] text-text">
            <p className="font-bold">{g.t('guide.failed')}</p>
            <p className="text-muted text-[13px] mt-0.5">{g.t('guide.failedBody')}</p>
          </div>
        )}
        {answered && g.guide?.answer && (list || g.steps.length === 0) && <p className="text-[15px] leading-[22px] text-text">{g.guide.answer}</p>}
        {answered && g.steps.length > 0 && (
          <>
            <GuideProgress />
            {list ? (
              <ol className="flex flex-col gap-3">
                {g.steps.map((s: GuideStep, i: number) => (
                  <li key={s.id} className="flex gap-2.5" aria-current={i === g.current ? 'step' : undefined}>
                    <span className={cn('w-[22px] h-[22px] shrink-0 rounded-full grid place-items-center text-[12px] font-bold', i === g.current ? 'bg-primary text-on-primary' : i < g.current ? 'bg-success-soft text-success' : 'bg-surface2 text-muted')}>{i + 1}</span>
                    <span className={cn('text-[14px] leading-[22px]', i === g.current ? 'font-bold text-text' : i < g.current ? 'text-muted' : 'text-text')}>{s.text}</span>
                  </li>
                ))}
              </ol>
            ) : (
              !g.finished && g.step && <p className="text-[15px] leading-[22px] text-text">{g.t('guide.stepOf', { n: g.current + 1, total: g.steps.length })}: {g.step.text}</p>
            )}
            {g.missing && !g.finished && <p className="text-[13px] text-muted">{g.t('guide.notHere')}</p>}
            {g.finished
              ? <p className="text-[14px] font-bold text-success">{g.t('guide.done')}</p>
              : list && <p className="text-[12px] leading-[18px] text-muted">{g.t('guide.moveOn')}</p>}
          </>
        )}
        {answered && g.guide?.sources?.length > 0 && list && (
          <p className="text-[12px] text-muted">{g.t('guide.from')} {g.guide.sources.map((s: { title: string }) => s.title).join(', ')}</p>
        )}
      </div>
    </div>
  )
}
