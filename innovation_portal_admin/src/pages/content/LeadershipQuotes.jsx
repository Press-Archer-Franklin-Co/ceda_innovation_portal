import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core'
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ArrowDown, ArrowUp, Globe, GripVertical, ImagePlus, Plus, Trash2 } from 'lucide-react'
import PageHeader from '../../components/ui/PageHeader'
import Button from '../../components/ui/Button'
import Input from '../../components/ui/Input'
import Textarea from '../../components/ui/Textarea'
import Avatar from '../../components/ui/Avatar'
import Tag from '../../components/ui/Tag'
import EmptyState from '../../components/ui/EmptyState'
import ErrorState from '../../components/ui/ErrorState'
import Skeleton from '../../components/ui/Skeleton'
import { Toggle } from '../../components/ui/Choice'
import { useConfirm } from '../../components/ui/confirm'
import { useToast } from '../../components/ui/toast'
import Switch from '../../components/content/Switch'
import HomePreview from '../../components/content/home/HomePreview'
import { useT } from '../../i18n/context'
import { cn } from '../../lib/cn'
import { QUOTE_MAX, bandSection, fromCard, moveCard, quoteProblems, reorderPayload, showsNow, toCardPayload } from '../../lib/content/quotes'
import { useQuoteAction, useQuotes, useSiteSettings } from '../../lib/queries/websiteContent'

const apiMessage = (err) => {
  const data = err?.data?.errors ?? err?.data ?? {}
  const first = Array.isArray(data) ? data[0] : typeof data === 'object' ? Object.values(data).flat()[0] : null
  return typeof first === 'string' ? first : err?.message ?? ''
}

function QuoteRow({ card, index, count, selected, onSelect, onMove, onToggle }) {
  const t = useT()
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: card.id })
  const ended = card.end_at && new Date(card.end_at).getTime() <= Date.now()
  return (
    <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={cn('list-none', isDragging && 'relative z-10')}>
      <div className={cn('flex items-start gap-2 rounded-card border bg-surface p-3', selected ? 'border-primary ring-1 ring-primary' : 'border-border', isDragging && 'shadow-lg')}>
        <button type="button" {...attributes} {...listeners} aria-label={t('quotes.dragHint')} className="mt-2 flex h-8 w-6 shrink-0 cursor-grab touch-none items-center justify-center rounded text-muted hover:text-text">
          <GripVertical size={16} aria-hidden />
        </button>
        <Avatar name={card.full_name} src={card.photo_url} size="md" />
        <button type="button" onClick={onSelect} className="min-w-0 flex-1 text-left" aria-current={selected || undefined}>
          <span className="block text-[14px] font-bold text-text">{card.full_name}</span>
          <span className="block text-[12px] text-muted">{[card.job_title, card.committee_role].filter(Boolean).join(', ')}</span>
          <span className="mt-1 line-clamp-2 block text-[13px] text-text">“{card.quote}”</span>
          <span className="mt-1 flex flex-wrap gap-1">
            {card.needs_approval && <Tag tone="amber">{t('quotes.waiting')}</Tag>}
            {ended && <Tag tone="neutral">{t('quotes.ended')}</Tag>}
            {!card.is_active && <Tag tone="neutral">{t('quotes.off')}</Tag>}
          </span>
        </button>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <Switch checked={!!card.is_active} onChange={onToggle} label={t('quotes.show', { name: card.full_name })} />
          <span className="flex">
            <button type="button" onClick={() => onMove(-1)} disabled={index === 0} aria-label={t('quotes.moveUp', { name: card.full_name })} className="flex h-7 w-7 items-center justify-center rounded text-muted hover:text-text disabled:opacity-30"><ArrowUp size={14} aria-hidden /></button>
            <button type="button" onClick={() => onMove(1)} disabled={index === count - 1} aria-label={t('quotes.moveDown', { name: card.full_name })} className="flex h-7 w-7 items-center justify-center rounded text-muted hover:text-text disabled:opacity-30"><ArrowDown size={14} aria-hidden /></button>
          </span>
        </div>
      </div>
    </li>
  )
}

function QuoteEditor({ card, nextOrder, onSaved, onDeleted }) {
  const t = useT()
  const toast = useToast()
  const confirm = useConfirm()
  const act = useQuoteAction()
  const photoInput = useRef(null)
  const [form, setForm] = useState(() => fromCard(card))
  const [lang, setLang] = useState('en')
  const [show, setShow] = useState(false)
  const [apiErrors, setApiErrors] = useState({})
  const saved = useRef(JSON.stringify(fromCard(card)))
  const dirty = JSON.stringify(form) !== saved.current
  const problems = quoteProblems(form)
  const set = (patch) => setForm((f) => ({ ...f, ...patch }))
  const err = (k) => apiErrors[k] || (show && problems[k] ? t(problems[k]) : undefined)

  useEffect(() => {
    if (!dirty) return undefined
    const warn = (e) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  async function save() {
    setShow(true)
    if (Object.keys(problems).length) return
    try {
      const body = toCardPayload(form, card)
      // A new quote goes to the end of the list.
      const result = card?.id ? await act.mutateAsync({ action: 'update', id: card.id, value: body }) : await act.mutateAsync({ action: 'create', value: { ...body, sort_order: nextOrder } })
      saved.current = JSON.stringify(form)
      setApiErrors({})
      toast.show({ tone: 'success', title: form.is_official ? t('quotes.savedApproval') : t('quotes.saved') })
      onSaved(result)
    } catch (e) {
      const data = e?.data?.errors ?? e?.data
      if (data && typeof data === 'object' && !Array.isArray(data)) setApiErrors(Object.fromEntries(Object.entries(data).map(([k, v]) => [k, Array.isArray(v) ? String(v[0]) : String(v)])))
      toast.show({ tone: 'error', title: t('quotes.failed', { message: apiMessage(e) }) })
    }
  }

  async function remove() {
    const ok = await confirm({ title: t('quotes.deleteTitle', { name: card.full_name }), body: t('quotes.deleteBody'), confirmLabel: t('quotes.delete') })
    if (!ok) return
    try {
      await act.mutateAsync({ action: 'remove', id: card.id })
      toast.show({ tone: 'success', title: t('quotes.deleted') })
      onDeleted()
    } catch (e) {
      toast.show({ tone: 'error', title: t('quotes.failed', { message: apiMessage(e) }) })
    }
  }

  async function onPhoto(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || !card?.id) return
    try {
      await act.mutateAsync({ action: 'photo', id: card.id, value: file })
      toast.show({ tone: 'success', title: t('quotes.photoSaved') })
    } catch (e) {
      toast.show({ tone: 'error', title: t('quotes.failed', { message: apiMessage(e) }) })
    }
  }

  return (
    <section aria-labelledby="quote-editor" className="flex flex-col gap-4 rounded-card border border-border bg-surface p-4 lg:sticky lg:top-4">
      <div className="flex items-center justify-between gap-2">
        <h2 id="quote-editor" className="font-heading text-[17px] font-bold text-text">{card?.id ? t('quotes.edit') : t('quotes.new')}</h2>
        <div role="radiogroup" aria-label={t('lang.label')} className="flex items-center gap-1 rounded-control bg-surface2 p-1">
          <Globe size={14} aria-hidden className="ml-1 text-muted" />
          {['en', 'tn'].map((l) => (
            <button key={l} type="button" role="radio" aria-checked={lang === l} onClick={() => setLang(l)}
              className={cn('h-7 rounded px-2.5 text-[12px]', lang === l ? 'bg-surface font-bold text-text shadow-sm' : 'text-muted hover:text-text')}>{t(`lang.${l}`)}</button>
          ))}
        </div>
      </div>
      <Input label={t('quotes.name')} value={form.full_name} onChange={(e) => set({ full_name: e.target.value })} maxLength={255} required error={err('full_name')} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Input label={t('quotes.jobTitle')} value={form.job_title} onChange={(e) => set({ job_title: e.target.value })} maxLength={255} required error={err('job_title')} />
        <Input label={t('quotes.role')} value={form.committee_role} onChange={(e) => set({ committee_role: e.target.value })} maxLength={255} optional error={err('committee_role')} />
      </div>
      <Textarea label={t('quotes.quote')} value={form.quote[lang]} rows={4} maxChars={QUOTE_MAX} required={lang === 'en'}
        hint={lang === 'tn' && form.quote.en ? `${t('lang.en')}: ${form.quote.en}` : undefined}
        onChange={(e) => set({ quote: { ...form.quote, [lang]: e.target.value } })} error={err('quote')} />
      {form.quote.en.trim() && !form.quote.tn.trim() && <p className="text-[12px] text-muted">{t('quotes.missingTn')}</p>}
      <div className="flex flex-col gap-1">
        <p className="text-[13px] font-bold text-text">{t('quotes.photo')}</p>
        <div className="flex items-center gap-3">
          <Avatar name={form.full_name || '?'} src={card?.photo_url} size="lg" />
          {card?.id ? (
            <Button variant="secondary" size="sm" icon={<ImagePlus size={14} aria-hidden />} loading={act.isPending && act.variables?.action === 'photo'} onClick={() => photoInput.current?.click()}>{t('quotes.photoChoose')}</Button>
          ) : (
            <p className="text-[12px] text-muted">{t('quotes.photoSaveFirst')}</p>
          )}
        </div>
        <p className="text-[12px] text-muted">{t('quotes.photoHint')}</p>
        <input ref={photoInput} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" tabIndex={-1} onChange={onPhoto} aria-label={t('quotes.photoChoose')} />
      </div>
      <Input type="datetime-local" label={t('quotes.endAt')} hint={t('quotes.endAtHint')} value={form.end_at} onChange={(e) => set({ end_at: e.target.value })} optional error={err('end_at')} />
      <Toggle label={t('quotes.active')} checked={form.is_active} onChange={(v) => set({ is_active: v })} />
      <Toggle label={t('quotes.official')} description={t('quotes.officialHint')} checked={form.is_official} onChange={(v) => set({ is_official: v })} />
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
        {card?.id ? <Button variant="ghost" size="sm" icon={<Trash2 size={14} aria-hidden />} onClick={remove}>{t('quotes.delete')}</Button> : <span />}
        <div className="flex items-center gap-2">
          {dirty && <span className="text-[12px] text-muted" role="status">{t('quotes.unsaved')}</span>}
          <Button onClick={save} loading={act.isPending && act.variables?.action !== 'photo'} disabled={!dirty && !!card?.id}>{t('quotes.save')}</Button>
        </div>
      </div>
    </section>
  )
}

function Rotation({ value }) {
  const t = useT()
  const toast = useToast()
  const act = useQuoteAction()
  const [seconds, setSeconds] = useState(value ?? 8)
  useEffect(() => setSeconds(value ?? 8), [value])
  const save = async () => {
    const n = Math.min(30, Math.max(3, Number.parseInt(seconds, 10) || 8))
    setSeconds(n)
    if (n === value) return
    try {
      await act.mutateAsync({ action: 'rotation', value: n })
      toast.show({ tone: 'success', title: t('quotes.rotationSaved'), duration: 2000 })
    } catch (e) {
      toast.show({ tone: 'error', title: t('quotes.failed', { message: apiMessage(e) }) })
    }
  }
  return (
    <Input type="number" inputMode="numeric" min={3} max={30} label={t('quotes.rotation')} hint={t('quotes.rotationHint')} value={seconds}
      onChange={(e) => setSeconds(e.target.value)} onBlur={save} onKeyDown={(e) => e.key === 'Enter' && save()} fieldClassName="max-w-56" />
  )
}

/** 3.12 Leadership quotes (Figma 31:469 website, 34:770 phone). */
export default function LeadershipQuotes() {
  const t = useT()
  const toast = useToast()
  const quotesQuery = useQuotes()
  const settings = useSiteSettings()
  const act = useQuoteAction()
  const [order, setOrder] = useState(null)
  const [selected, setSelected] = useState(null) // card id, 'new' or null
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }))

  useEffect(() => {
    if (quotesQuery.data) setOrder(quotesQuery.data)
  }, [quotesQuery.data])
  useEffect(() => {
    if (selected === null && quotesQuery.data?.length) setSelected(quotesQuery.data[0].id)
  }, [quotesQuery.data, selected])

  const cards = useMemo(() => order ?? [], [order])
  const card = cards.find((c) => c.id === selected) ?? null
  const rotation = settings.data?.quote_rotation_seconds ?? 8
  const band = useMemo(() => [bandSection(cards, rotation, 'en')], [cards, rotation])
  const showing = cards.filter((c) => showsNow(c)).length

  const saveOrder = async (next) => {
    const before = cards
    setOrder(next)
    try {
      await act.mutateAsync({ action: 'reorder', value: reorderPayload(next) })
    } catch (e) {
      setOrder(before)
      toast.show({ tone: 'error', title: t('quotes.failed', { message: apiMessage(e) }) })
    }
  }
  const move = (index, delta) => {
    const target = cards[index + delta]
    if (target) saveOrder(moveCard(cards, cards[index].id, target.id))
  }
  const toggle = async (c, on) => {
    setOrder(cards.map((x) => (x.id === c.id ? { ...x, is_active: on } : x)))
    try {
      await act.mutateAsync({ action: 'update', id: c.id, value: { is_active: on } })
    } catch (e) {
      setOrder(cards)
      toast.show({ tone: 'error', title: t('quotes.failed', { message: apiMessage(e) }) })
    }
  }

  if (quotesQuery.isError) return <ErrorState title={t('quotes.loadError')} onRetry={() => quotesQuery.refetch()} />

  return (
    <div>
      <p className="mb-1 text-[12px] text-muted"><Link to="/content/home" className="hover:underline">{t('news.crumb')}</Link> / {t('quotes.title')}</p>
      <PageHeader title={t('quotes.title')} subtitle={t('quotes.subtitle')}
        actions={<Button icon={<Plus size={15} aria-hidden />} onClick={() => setSelected('new')}>{t('quotes.add')}</Button>} />

      <div className="mb-4"><Rotation value={settings.data?.quote_rotation_seconds} /></div>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_400px]">
        <section aria-labelledby="quotes-list">
          <h2 id="quotes-list" className="mb-2 font-heading text-[15px] font-bold text-text">{t('quotes.list')}</h2>
          {quotesQuery.isLoading || !order ? (
            <div className="flex flex-col gap-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-card" />)}</div>
          ) : cards.length === 0 ? (
            <EmptyState title={t('quotes.empty')} message={t('quotes.emptyBody')} framed action={<Button onClick={() => setSelected('new')}>{t('quotes.add')}</Button>} />
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={({ active, over }) => over && active.id !== over.id && saveOrder(moveCard(cards, active.id, over.id))}>
              <SortableContext items={cards.map((c) => c.id)} strategy={verticalListSortingStrategy}>
                <ul className="flex flex-col gap-2">
                  {cards.map((c, i) => (
                    <QuoteRow key={c.id} card={c} index={i} count={cards.length} selected={c.id === selected}
                      onSelect={() => setSelected(c.id)} onMove={(d) => move(i, d)} onToggle={(on) => toggle(c, on)} />
                  ))}
                </ul>
              </SortableContext>
            </DndContext>
          )}
        </section>

        {(card || selected === 'new') && (
          <QuoteEditor key={card?.id ?? 'new'} card={card} nextOrder={cards.reduce((n, c) => Math.max(n, (c.sort_order ?? 0) + 1), cards.length)}
            onSaved={(saved) => saved?.id && setSelected(saved.id)}
            onDeleted={() => setSelected(null)} />
        )}
      </div>

      <section aria-labelledby="quotes-preview" className="mt-6">
        <h2 id="quotes-preview" className="mb-1 font-heading text-[15px] font-bold text-text">{t('quotes.preview')}</h2>
        <p className="mb-2 text-[12px] text-muted">{showing ? t('quotes.previewNote') : t('quotes.previewEmpty')}</p>
        {showing > 0 && <HomePreview sections={band} lang="en" height="auto" />}
      </section>
    </div>
  )
}
