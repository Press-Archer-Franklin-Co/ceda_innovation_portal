import { useRef } from 'react'
import { useDraggable, useDroppable } from '@dnd-kit/core'
import { GripVertical, Plus, Trash2 } from 'lucide-react'
import Tag from '../../ui/Tag'
import { useT } from '../../../i18n/context'
import { cn } from '../../../lib/cn'
import { pick } from '../../../lib/forms/format'
import { LAYOUT_TYPES, MAX_PER_ROW, WIDTH_UNITS, WIDTHS, allowedWidths } from '../../../lib/forms/document'
import { TYPE_ICON } from './icons'

const SPAN = { quarter: 'sm:col-span-1', half: 'sm:col-span-2', three_quarter: 'sm:col-span-3', full: 'sm:col-span-4' }

/**
 * 3.5 centre: the current step as rows of fields. While something is being
 * dragged, drop zones appear between rows ("on its own row") and at the end of
 * each row that has room ("next to …"); dropping on a field puts it before that field.
 */
export default function Canvas({
  doc, stepIndex, onStepChange, onAddStep, onRemoveStep, onRenameStep, lang, selectedKey, onSelect, dragging, onWidth, device,
}) {
  const t = useT()
  const step = doc.steps[stepIndex]
  return (
    <section aria-label={t('builder.elements')} className="min-w-0 rounded-card border border-border bg-surface2 p-[14px] 2xl:p-[20px]">
      <div className="flex flex-wrap items-center gap-2">
        <div role="tablist" aria-label={t('steps.label')} className="flex flex-wrap gap-2">
          {doc.steps.map((s, i) => (
            <button
              key={s.code}
              type="button"
              role="tab"
              aria-selected={i === stepIndex}
              onClick={() => onStepChange(i)}
              className={cn(
                'h-9 rounded-control border px-3 text-[13px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                i === stepIndex ? 'border-primary bg-surface font-bold text-text' : 'border-border bg-surface text-muted hover:text-text',
              )}
            >
              {i + 1} · {pick(s.title, lang) || t('builder.untitled')}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={onAddStep}
          className="inline-flex h-9 items-center gap-1.5 rounded-control border border-dashed border-border px-3 text-[13px] text-text hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <Plus size={14} aria-hidden /> {t('builder.newStep')}
        </button>
      </div>

      {step && (
        <div className={cn('mx-auto mt-4 rounded-card border border-border bg-surface p-5 transition-[max-width]', device === 'phone' ? 'max-w-[390px]' : 'max-w-none')}>
          <div className="mb-4 flex items-center gap-2">
            <label className="sr-only" htmlFor="step-name">{t('builder.stepName')}</label>
            <input
              id="step-name"
              value={step.title?.[lang] ?? ''}
              placeholder={lang === 'tn' ? pick(step.title, 'en') : t('builder.stepName')}
              onChange={(e) => onRenameStep(stepIndex, lang, e.target.value)}
              className="min-w-0 flex-1 rounded-control border border-transparent px-2 py-1 text-[16px] font-bold text-text hover:border-border focus:border-primary focus:outline-none"
            />
            {doc.steps.length > 1 && (
              <button
                type="button"
                onClick={() => onRemoveStep(stepIndex)}
                aria-label={t('builder.removeStep')}
                className="flex h-9 w-9 items-center justify-center rounded-control text-muted hover:bg-surface2 hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <Trash2 size={16} aria-hidden />
              </button>
            )}
          </div>

          <div className="flex flex-col">
            <NewRowZone stepIndex={stepIndex} at={0} visible={dragging} />
            {step.rows.length === 0 && !dragging && (
              <p className="rounded-control border border-dashed border-border p-6 text-center text-[13px] text-muted">{t('builder.emptyStep')}</p>
            )}
            {step.rows.map((row, rowIndex) => (
              <div key={`${stepIndex}-${row.row}`}>
                <div className={cn('grid grid-cols-1 gap-3', device === 'phone' ? '' : 'sm:grid-cols-4')}>
                  {row.fields.map((field, index) => (
                    <FieldBlock
                      key={field.key}
                      field={field}
                      stepIndex={stepIndex}
                      rowIndex={rowIndex}
                      index={index}
                      lang={lang}
                      selected={selectedKey === field.key}
                      onSelect={onSelect}
                      dragging={dragging}
                      allowed={allowedWidths(doc, field.key)}
                      onWidth={onWidth}
                      phone={device === 'phone'}
                    />
                  ))}
                  {row.fields.length < MAX_PER_ROW && (
                    <BesideZone stepIndex={stepIndex} rowIndex={rowIndex} index={row.fields.length} visible={dragging} after={pick(row.fields[row.fields.length - 1]?.label, lang)} />
                  )}
                </div>
                <NewRowZone stepIndex={stepIndex} at={rowIndex + 1} visible={dragging} />
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}

function NewRowZone({ stepIndex, at, visible }) {
  const t = useT()
  const { setNodeRef, isOver } = useDroppable({ id: `newrow:${stepIndex}:${at}` })
  return (
    <div ref={setNodeRef} aria-hidden={!visible} className={cn('transition-all', visible ? 'py-1.5' : 'h-3')}>
      {visible && (
        <div className={cn('rounded-control border-2 border-dashed px-3 py-2 text-center text-[12px]', isOver ? 'border-primary bg-primary-soft text-primary' : 'border-border text-muted')}>
          {t('builder.dropRow')}
        </div>
      )}
    </div>
  )
}

function BesideZone({ stepIndex, rowIndex, index, visible, after }) {
  const t = useT()
  const { setNodeRef, isOver } = useDroppable({ id: `beside:${stepIndex}:${rowIndex}:${index}` })
  if (!visible) return <div ref={setNodeRef} className="hidden" />
  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex min-h-[64px] flex-col items-center justify-center rounded-control border-2 border-dashed px-2 text-center sm:col-span-1',
        isOver ? 'border-primary bg-primary-soft text-primary' : 'border-border text-muted',
      )}
    >
      <span className="text-[13px] font-bold">{t('builder.dropHere')}</span>
      {after && <span className="text-[11px]">{t('builder.dropBeside', { name: after })}</span>}
    </div>
  )
}

function FieldBlock({ field, stepIndex, rowIndex, index, lang, selected, onSelect, dragging, allowed, onWidth, phone }) {
  const t = useT()
  const ref = useRef(null)
  const drag = useDraggable({ id: `field:${field.key}`, data: { key: field.key } })
  const drop = useDroppable({ id: `beside:${stepIndex}:${rowIndex}:${index}`, data: { before: field.key } })
  const label = pick(field.label, lang)
  const missingTn = lang === 'tn' && (field.label?.en ?? '').trim() && !(field.label?.tn ?? '').trim()
  const hasCondition = (field.visible_if?.all ?? []).length > 0
  const Icon = TYPE_ICON[field.type]

  function startResize(e) {
    e.preventDefault()
    e.stopPropagation()
    const row = ref.current?.parentElement
    if (!row) return
    const rect = row.getBoundingClientRect()
    const left = ref.current.getBoundingClientRect().left
    const move = (ev) => {
      const units = Math.max(1, Math.min(4, Math.round(((ev.clientX - left) / rect.width) * 4)))
      const width = WIDTHS.find((w) => WIDTH_UNITS[w] === units)
      if (width && width !== field.width && allowed.includes(width)) onWidth(field.key, width)
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  return (
    <div
      ref={(node) => {
        ref.current = node
        drop.setNodeRef(node)
      }}
      className={cn('relative min-w-0', phone ? '' : SPAN[field.width] ?? SPAN.full)}
    >
      <div
        className={cn(
          'group relative rounded-control border bg-surface p-3 transition-shadow',
          selected ? 'border-2 border-primary' : 'border-border hover:border-muted',
          field.is_challenge_question && 'bg-accent-soft/40',
          drop.isOver && dragging && 'ring-2 ring-primary ring-offset-2',
          drag.isDragging && 'opacity-40',
        )}
      >
        <div className="flex items-start gap-2">
          <button
            type="button"
            {...drag.attributes}
            {...drag.listeners}
            aria-label={t('builder.move', { name: label || t('builder.untitled') })}
            className="mt-0.5 flex h-7 w-6 shrink-0 cursor-grab items-center justify-center rounded text-muted hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <GripVertical size={14} aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => onSelect(field.key)}
            aria-pressed={selected}
            className="min-w-0 flex-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded"
          >
            {LAYOUT_TYPES.has(field.type) ? (
              <span className={cn('block text-text', field.type === 'heading' ? 'text-[15px] font-bold' : 'text-[13px]')}>
                {label || t(`builder.type.${field.type}`)}
              </span>
            ) : (
              <>
                <span className="block text-[13px] font-bold text-text">
                  {label || <span className="font-normal italic text-muted">{t('builder.untitled')}</span>}
                  {field.required && <span aria-hidden className="text-primary"> *</span>}
                </span>
                <span className="mt-1.5 flex h-9 items-center gap-2 rounded-control border border-border bg-surface2 px-2.5 text-[12px] text-muted">
                  {Icon && <Icon size={14} aria-hidden />}
                  <span className="truncate">{pick(field.placeholder, lang) || t(`builder.type.${field.type}`)}</span>
                </span>
              </>
            )}
            {(field.is_challenge_question || hasCondition || missingTn) && (
              <span className="mt-2 flex flex-wrap gap-1">
                {field.is_challenge_question && <Tag tone="orange">{t('builder.challengeQuestion')}</Tag>}
                {hasCondition && <Tag tone="blue">{t('builder.shownIf')}</Tag>}
                {missingTn && <Tag tone="amber">{t('builder.missingTn')}</Tag>}
              </span>
            )}
          </button>
        </div>
        {!phone && (
          <span
            role="presentation"
            onPointerDown={startResize}
            className="absolute -right-1.5 top-1/2 hidden h-7 w-2 -translate-y-1/2 cursor-ew-resize rounded-full bg-primary group-hover:block"
          />
        )}
      </div>
    </div>
  )
}
