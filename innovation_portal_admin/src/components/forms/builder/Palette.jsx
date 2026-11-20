import { useDraggable } from '@dnd-kit/core'
import { useT } from '../../../i18n/context'
import { PALETTE } from '../../../lib/forms/document'
import { cn } from '../../../lib/cn'
import { TYPE_ICON } from './icons'

/** 3.5 left panel: drag an element onto the page, or click (or press Enter) to add it at the end of the step. */
export default function Palette({ onAdd, disabled }) {
  const t = useT()
  return (
    <aside aria-label={t('builder.elements')} className="rounded-card border border-border bg-surface p-[14px] 2xl:p-[18px]">
      <h2 className="text-[15px] font-bold text-text">{t('builder.elements')}</h2>
      <p className="mt-1 text-[12px] text-muted">{t('builder.dragHint')}</p>
      {PALETTE.map(({ group, types }) => (
        <div key={group} className="mt-4">
          <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-muted">{t(`builder.group.${group}`)}</p>
          <div className="grid grid-cols-2 gap-1.5">
            {types.map((type) => (
              <PaletteItem key={type} type={type} onAdd={onAdd} disabled={disabled} />
            ))}
          </div>
        </div>
      ))}
    </aside>
  )
}

function PaletteItem({ type, onAdd, disabled }) {
  const t = useT()
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `palette:${type}`, data: { type }, disabled })
  const Icon = TYPE_ICON[type]
  return (
    <button
      ref={setNodeRef}
      type="button"
      {...attributes}
      {...listeners}
      onClick={() => onAdd(type)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          onAdd(type)
          return
        }
        listeners?.onKeyDown?.(e)
      }}
      disabled={disabled}
      className={cn(
        'flex min-h-9 items-center gap-1.5 rounded-control border border-border bg-surface px-2 py-1.5 text-left text-[12px] leading-tight text-text',
        'hover:bg-surface2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50',
        isDragging && 'opacity-40',
      )}
    >
      {Icon && <Icon size={14} aria-hidden className="shrink-0 text-muted" />}
      <span className="min-w-0">{t(`builder.type.${type}`)}</span>
    </button>
  )
}
