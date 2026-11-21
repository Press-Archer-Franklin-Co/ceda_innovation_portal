import { useState } from 'react'
import { ArrowDown, ArrowUp, Check, ChevronDown, ChevronUp, Lightbulb, Minus, Plus, Trash2 } from 'lucide-react'
import Button from '../ui/Button'
import Input, { InputControl } from '../ui/Input'
import { Checkbox, Toggle } from '../ui/Choice'
import { SelectControl } from '../ui/Select'
import ErrorState from '../ui/ErrorState'
import Skeleton from '../ui/Skeleton'
import { useToast } from '../ui/toast'
import { useT } from '../../i18n/context'
import { cn } from '../../lib/cn'
import { useAddLibraryCriterion, useCriteriaLibrary } from '../../lib/queries/forms'
import {
import DataTable from '../ui/DataTable'
  SCORES, isTicked, move, normaliseMeanings, nudge, setCommentRule, setWeight, splitEvenly, toggleLibrary, total,
} from '../../lib/challenges/judging'

const SEGMENT_TONES = ['bg-primary', 'bg-amber', 'bg-info', 'bg-success', 'bg-accent', 'bg-banner']

/**
 * The marking criteria of one challenge. `value` is { criteria, pass_mark, reviewers_per_idea };
 * every change calls onChange with the next value (the page saves it).
 *
 * variant "full" (3.7): library with tick boxes, weights with a split bar, score meanings,
 * comment rule, pass mark and both previews. variant "compact" (3.6 judging step): the
 * criteria table, the total, and "Add criterion" from the library.
 */
export default function JudgingEditor({ value, onChange, variant = 'full' }) {
  const t = useT()
  const criteria = value.criteria
  const sum = total(criteria)
  const ok = Math.abs(sum - 100) < 0.001
  const set = (next) => onChange({ ...value, criteria: next })

  const weightsCard = (
    <div className="rounded-card border border-border bg-surface p-[14px]">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-[14px] font-bold text-text">{t('mc.weights')}</h3>
        <button type="button" onClick={() => set(splitEvenly(criteria))} disabled={!criteria.length} className="text-[12px] text-primary hover:underline disabled:text-muted">
          {t('mc.split')}
        </button>
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="text-[13px] text-text">{t('mc.total')}</span>
        <span role="status" className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-bold', ok ? 'bg-success-soft text-success' : 'bg-warning-soft text-text')}>
          {ok && <Check size={12} aria-hidden />}
          {t('mc.totalOf', { total: sum })}
        </span>
      </div>
      <div aria-hidden className="mt-2 flex h-3 gap-0.5 overflow-hidden rounded-full bg-surface2">
        {criteria.map((c, i) => (
          <span key={c.id ?? c.library_id ?? i} className={SEGMENT_TONES[i % SEGMENT_TONES.length]} style={{ width: `${Math.min(100, Number(c.weight || 0))}%` }} />
        ))}
      </div>
      {!ok && criteria.length > 0 && <p className="mt-2 text-[12px] text-muted">{t('mc.mustBe100')}</p>}
    </div>
  )

  if (variant === 'compact') {
    return (
      <div className="flex flex-col gap-3">
        <DataTable
          caption={t('mc.criterion')}
          data={criteria.map((c, i) => ({ ...c, id: c.id ?? c.library_id ?? `row-${i}`, _index: i }))}
          emptyTitle={t('mc.empty')}
          columns={[
            { key: 'order', label: '', width: 32, render: (_, c) => <OrderButtons index={c._index} count={criteria.length} name={c.name} onMove={(to) => set(move(criteria, c._index, to))} /> },
            { key: 'name', label: t('mc.criterion'), render: (v) => <span className="font-bold text-text">{v}</span> },
            { key: 'description', label: t('mc.lookFor'), render: (v) => <span className="text-muted">{v}</span> },
            {
              key: 'weight', label: t('mc.weight'), width: 130,
              render: (_, c) => (
                <InputControl
                  aria-label={`${t('mc.weight')}: ${c.name}`}
                  inputMode="numeric"
                  value={String(c.weight ?? 0)}
                  onChange={(e) => set(setWeight(criteria, c._index, e.target.value.replace(/[^\d.]/g, '')))}
                  trailing={<span className="pr-2 text-[12px]">%</span>}
                />
              ),
            },
            {
              key: 'remove', label: '', width: 40,
              render: (_, c) => (
                <button type="button" onClick={() => set(criteria.filter((_, j) => j !== c._index))} aria-label={t('mc.remove', { name: c.name })} className="flex h-8 w-8 items-center justify-center rounded-control text-muted hover:text-danger">
                  <Trash2 size={15} aria-hidden />
                </button>
              ),
            },
          ]}
        />
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-border bg-surface px-3 py-2.5">
          <span role="status" className={cn('inline-flex items-center gap-1.5 text-[13px]', ok ? 'text-success' : 'text-text')}>
            {ok && <Check size={16} aria-hidden />}
            {t('mc.total')}: {t('mc.totalOf', { total: sum })}
          </span>
          <LibraryAdd criteria={criteria} onPick={(item) => set(toggleLibrary(criteria, item))} />
        </div>
      </div>
    )
  }

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[240px_minmax(0,1fr)] xl:grid-cols-[260px_minmax(0,1fr)_280px]">
      <LibraryPanel criteria={criteria} onToggle={(item) => set(toggleLibrary(criteria, item))} />

      <div className="flex min-w-0 flex-col gap-4">
        {weightsCard}
        <div className="rounded-card border border-border bg-surface p-[14px]">
          <h3 className="text-[14px] font-bold text-text">{t('mc.inRubric')}</h3>
          <p className="mt-1 text-[12px] text-muted">{t('mc.dragHint')}</p>
          {criteria.length === 0 ? (
            <p className="mt-3 rounded-control border border-dashed border-border p-4 text-center text-[13px] text-muted">{t('mc.empty')}</p>
          ) : (
            <ol className="mt-3 flex flex-col gap-2">
              {criteria.map((c, i) => (
                <CriterionRow
                  key={c.id ?? c.library_id ?? i}
                  criterion={c}
                  index={i}
                  count={criteria.length}
                  onChange={(next) => set(criteria.map((x, j) => (j === i ? next : x)))}
                  onNudge={(dir) => set(nudge(criteria, i, dir))}
                  onMove={(to) => set(move(criteria, i, to))}
                  onRemove={() => set(criteria.filter((_, j) => j !== i))}
                />
              ))}
            </ol>
          )}
        </div>
        <div className="grid gap-3 rounded-card border border-border bg-surface p-[14px] sm:grid-cols-2">
          <Input
            label={t('mc.passMark')}
            hint={t('mc.passMarkHint')}
            inputMode="numeric"
            value={value.pass_mark ?? ''}
            onChange={(e) => onChange({ ...value, pass_mark: e.target.value.replace(/[^\d.]/g, '') })}
          />
          <Input
            label={t('mc.reviewers')}
            hint={t('mc.reviewersHint')}
            inputMode="numeric"
            value={value.reviewers_per_idea ?? ''}
            onChange={(e) => onChange({ ...value, reviewers_per_idea: e.target.value.replace(/\D/g, '') })}
          />
        </div>
      </div>

      <Previews criteria={criteria} />
    </div>
  )
}

function OrderButtons({ index, count, name, onMove }) {
  const t = useT()
  return (
    <span className="flex flex-col">
      <button type="button" disabled={index === 0} onClick={() => onMove(index - 1)} aria-label={t('mc.up', { name })} className="flex h-5 w-6 items-center justify-center text-muted hover:text-text disabled:opacity-30">
        <ArrowUp size={13} aria-hidden />
      </button>
      <button type="button" disabled={index === count - 1} onClick={() => onMove(index + 1)} aria-label={t('mc.down', { name })} className="flex h-5 w-6 items-center justify-center text-muted hover:text-text disabled:opacity-30">
        <ArrowDown size={13} aria-hidden />
      </button>
    </span>
  )
}

function CriterionRow({ criterion, index, count, onChange, onNudge, onMove, onRemove }) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const meanings = normaliseMeanings(criterion.score_meanings)
  const commentRule = (criterion.comment_required_scores ?? []).length > 0
  return (
    <li className="rounded-control border border-border p-3">
      <div className="flex flex-wrap items-start gap-2">
        <OrderButtons index={index} count={count} name={criterion.name} onMove={onMove} />
        <div className="min-w-[60%] flex-1 sm:min-w-0">
          <p className="text-[13px] font-bold text-text">{criterion.name}</p>
          {criterion.description && <p className="text-[12px] text-muted">{criterion.description}</p>}
        </div>
        <div className="flex items-center rounded-control border border-border">
          <button type="button" onClick={() => onNudge(-1)} aria-label={t('mc.less', { name: criterion.name })} className="flex h-8 w-7 items-center justify-center text-muted hover:text-text">
            <Minus size={13} aria-hidden />
          </button>
          <span className="w-12 text-center text-[13px] font-bold tabular-nums text-text">{Number(criterion.weight || 0)}%</span>
          <button type="button" onClick={() => onNudge(1)} aria-label={t('mc.more', { name: criterion.name })} className="flex h-8 w-7 items-center justify-center text-muted hover:text-text">
            <Plus size={13} aria-hidden />
          </button>
        </div>
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label={t('mc.expand', { name: criterion.name })} className="flex h-8 w-8 items-center justify-center rounded-control text-muted hover:text-text">
          {open ? <ChevronUp size={16} aria-hidden /> : <ChevronDown size={16} aria-hidden />}
        </button>
        <button type="button" onClick={onRemove} aria-label={t('mc.remove', { name: criterion.name })} className="flex h-8 w-8 items-center justify-center rounded-control text-muted hover:text-danger">
          <Trash2 size={15} aria-hidden />
        </button>
      </div>
      {open && (
        <div className="mt-3 flex flex-col gap-3 border-t border-border pt-3">
          <p className="text-[12px] font-bold text-muted">{t('mc.meanings')}</p>
          <div className="grid gap-2 sm:grid-cols-5">
            {SCORES.map((score, i) => (
              <label key={score} className="flex flex-col gap-1 rounded-control bg-surface2 p-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-surface text-[12px] font-bold text-text">{score}</span>
                <span className="sr-only">{t('mc.score', { n: score })}</span>
                <textarea
                  value={meanings[i].en}
                  rows={5}
                  onChange={(e) => onChange({ ...criterion, score_meanings: meanings.map((m, j) => (j === i ? { ...m, en: e.target.value } : m)) })}
                  className="w-full resize-none rounded border border-border bg-surface p-1.5 text-[12px] text-text focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </label>
            ))}
          </div>
          <Toggle label={t('mc.commentRule')} checked={commentRule} onChange={(on) => onChange(setCommentRule(criterion, on))} />
        </div>
      )}
    </li>
  )
}

function useLibrary() {
  const query = useCriteriaLibrary()
  const items = Array.isArray(query.data) ? query.data : query.data?.results ?? []
  return { ...query, items }
}

function LibraryPanel({ criteria, onToggle }) {
  const t = useT()
  const toast = useToast()
  const library = useLibrary()
  const add = useAddLibraryCriterion()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [adding, setAdding] = useState(false)

  async function create() {
    if (!name.trim()) return
    try {
      await add.mutateAsync({ name: name.trim(), description: description.trim() })
      setName('')
      setDescription('')
      setAdding(false)
      toast.show({ tone: 'success', title: t('mc.added') })
    } catch (err) {
      toast.show({ tone: 'error', title: err?.message || t('common.somethingWrong') })
    }
  }

  return (
    <aside aria-label={t('mc.library')} className="flex flex-col gap-3">
      <div className="rounded-card border border-border bg-surface p-[14px]">
        <h3 className="text-[14px] font-bold text-text">{t('mc.library')}</h3>
        <p className="mt-1 text-[12px] text-muted">{t('mc.libraryIntro')}</p>
        {library.isLoading ? (
          <div className="mt-3 flex flex-col gap-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-7" />)}</div>
        ) : library.isError ? (
          <ErrorState title={t('mc.loadError')} onRetry={library.refetch} compact />
        ) : (
          <div className="mt-3 flex flex-col">
            {library.items.map((item) => (
              <Checkbox key={item.id} label={item.name} checked={isTicked(criteria, item)} onChange={() => onToggle(item)} />
            ))}
          </div>
        )}
        {adding ? (
          <div className="mt-3 flex flex-col gap-2">
            <Input label={t('mc.newName')} value={name} onChange={(e) => setName(e.target.value)} autoFocus />
            <Input label={t('mc.newDescription')} value={description} onChange={(e) => setDescription(e.target.value)} />
            <div className="flex gap-2">
              <Button size="sm" onClick={create} loading={add.isPending} disabled={!name.trim()}>{t('mc.addToLibrary')}</Button>
              <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>{t('common.cancel')}</Button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => setAdding(true)} className="mt-3 inline-flex items-center gap-1 text-[12px] text-primary hover:underline">
            <Plus size={12} aria-hidden /> {t('mc.newCriterion')}
          </button>
        )}
      </div>
      <p className="flex items-start gap-2 rounded-card bg-surface2 p-3 text-[12px] text-text">
        <Lightbulb size={16} aria-hidden className="mt-0.5 shrink-0 text-amber" />
        {t('mc.tip')}
      </p>
    </aside>
  )
}

function LibraryAdd({ criteria, onPick }) {
  const t = useT()
  const library = useLibrary()
  const options = library.items.filter((item) => !isTicked(criteria, item)).map((item) => ({ value: item.id, label: item.name }))
  if (!options.length) return null
  return (
    <div className="w-[240px]">
      <SelectControl
        aria-label={t('mc.newCriterion')}
        placeholder={`+ ${t('mc.newCriterion')}`}
        value={null}
        options={options}
        onChange={(id) => {
          const item = library.items.find((x) => x.id === id)
          if (item) onPick(item)
        }}
      />
    </div>
  )
}

function Previews({ criteria }) {
  const t = useT()
  const first = criteria.find((c) => c.description) ?? criteria[0]
  const meanings = first ? normaliseMeanings(first.score_meanings) : []
  return (
    <aside className="flex flex-col gap-4 lg:col-span-2 xl:col-span-1">
      <div className="rounded-card border border-border bg-surface p-[14px]">
        <h3 className="text-[14px] font-bold text-text">{t('mc.previewReviewer')}</h3>
        <p className="text-[12px] text-muted">{t('mc.previewReviewerHint')}</p>
        {first && (
          <div className="mt-3 rounded-control border border-border p-3">
            <p className="text-[13px] font-bold text-text">{first.name} · {Number(first.weight || 0)}%</p>
            {first.description && <p className="mt-1 text-[12px] text-muted">{first.description}</p>}
            <div className="mt-2 grid grid-cols-5 gap-1" aria-hidden>
              {SCORES.map((s) => <span key={s} className={cn('rounded border py-1 text-center text-[12px]', s === 4 ? 'border-primary bg-primary-soft font-bold text-primary' : 'border-border text-text')}>{s}</span>)}
            </div>
            {meanings[3]?.en && <p className="mt-2 text-[12px] text-text">4 · {meanings[3].en}</p>}
          </div>
        )}
      </div>
      <div className="rounded-card border border-border bg-surface p-[14px]">
        <h3 className="text-[14px] font-bold text-text">{t('mc.previewPublic')}</h3>
        <p className="text-[12px] text-muted">{t('mc.previewPublicHint')}</p>
        {criteria.length > 0 && (
          <div className="mt-3 rounded-control bg-surface2 p-3">
            <p className="text-[11px] font-bold uppercase tracking-wide text-muted">{t('mc.howWeJudge')}</p>
            <ul className="mt-2 flex flex-col gap-1.5">
              {criteria.map((c, i) => (
                <li key={c.id ?? c.library_id ?? i} className="flex justify-between gap-2 text-[13px] text-text">
                  <span>{c.name}</span>
                  <span className="tabular-nums">{Number(c.weight || 0)}%</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </aside>
  )
}
