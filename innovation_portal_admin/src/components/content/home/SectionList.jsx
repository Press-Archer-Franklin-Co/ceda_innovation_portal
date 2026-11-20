import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core'
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ArrowDown, ArrowUp, GripVertical, Lock, Plus } from 'lucide-react'
import { useT } from '../../../i18n/context'
import { cn } from '../../../lib/cn'
import { isFixed, typeSpec } from '../../../lib/content/home'
import { useSectionName } from './useSectionName'
import Switch from '../Switch'

function Row({ section, index, count, types, selected, invalid, onSelect, onToggle, onMove }) {
  const t = useT()
  const name = useSectionName()(types, section.type)
  const fixed = isFixed(types, section)
  const canDisable = typeSpec(types, section.type)?.can_disable !== false
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: section._key, disabled: fixed })
  const style = { transform: CSS.Transform.toString(transform), transition }
  const firstMovable = fixed ? false : index === 1
  return (
    <li ref={setNodeRef} style={style} className={cn('list-none', isDragging && 'relative z-10')}>
      <div
        className={cn(
          'flex min-h-12 items-center gap-2 rounded-card border bg-surface pl-2 pr-3 transition-colors',
          selected ? 'border-primary ring-1 ring-primary' : 'border-border hover:border-muted/60',
          invalid && !selected && 'border-danger',
          isDragging && 'shadow-lg',
        )}
      >
        {fixed ? (
          <span className="flex h-8 w-6 items-center justify-center text-muted"><Lock size={15} aria-hidden /></span>
        ) : (
          <button type="button" {...attributes} {...listeners} aria-label={t('home.dragHint')} className="flex h-8 w-6 cursor-grab touch-none items-center justify-center rounded text-muted hover:text-text active:cursor-grabbing">
            <GripVertical size={16} aria-hidden />
          </button>
        )}
        <button type="button" onClick={onSelect} aria-current={selected || undefined}
          className={cn('min-w-0 flex-1 py-3 text-left text-[14px] font-semibold', section.enabled ? 'text-text' : 'text-muted')}>
          {name}
          {!section.enabled && <span className="sr-only"> ({t('home.hidden')})</span>}
        </button>
        {!fixed && (
          <span className="flex items-center">
            <button type="button" onClick={() => onMove(-1)} disabled={firstMovable} aria-label={t('home.moveUp', { name })}
              className="flex h-8 w-7 items-center justify-center rounded text-muted hover:text-text disabled:opacity-30">
              <ArrowUp size={14} aria-hidden />
            </button>
            <button type="button" onClick={() => onMove(1)} disabled={index === count - 1} aria-label={t('home.moveDown', { name })}
              className="flex h-8 w-7 items-center justify-center rounded text-muted hover:text-text disabled:opacity-30">
              <ArrowDown size={14} aria-hidden />
            </button>
          </span>
        )}
        {canDisable ? (
          <Switch checked={section.enabled} onChange={onToggle} label={t('home.show', { name })} />
        ) : (
          <span className="shrink-0 rounded-full bg-surface2 px-2.5 py-1 text-[12px] font-semibold text-muted">{t('home.alwaysOn')}</span>
        )}
      </div>
    </li>
  )
}

/** 3.8 left column: the sections in order, each with a switch; the banner is locked first. */
export default function SectionList({ sections, types, selectedKey, invalidKeys, onSelect, onToggle, onMove, onAdd }) {
  const t = useT()
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
  const move = (index, delta) => {
    const target = sections[index + delta]
    if (target) onMove(sections[index]._key, target._key)
  }
  return (
    <div className="flex flex-col gap-2">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={({ active, over }) => over && onMove(active.id, over.id)}>
        <SortableContext items={sections.map((s) => s._key)} strategy={verticalListSortingStrategy}>
          <ul className="flex flex-col gap-2" aria-describedby="home-drag-hint">
            {sections.map((section, index) => (
              <Row
                key={section._key}
                section={section}
                index={index}
                count={sections.length}
                types={types}
                selected={section._key === selectedKey}
                invalid={invalidKeys?.has(section._key)}
                onSelect={() => onSelect(section._key)}
                onToggle={(on) => onToggle(section._key, on)}
                onMove={(delta) => move(index, delta)}
              />
            ))}
          </ul>
        </SortableContext>
      </DndContext>
      <p id="home-drag-hint" className="sr-only">{t('home.dragHint')}</p>
      <button type="button" onClick={onAdd}
        className="flex min-h-12 items-center justify-center gap-1.5 rounded-card border border-dashed border-border text-[14px] font-semibold text-primary hover:bg-primary-soft">
        <Plus size={16} aria-hidden /> {t('home.addSection')}
      </button>
    </div>
  )
}
