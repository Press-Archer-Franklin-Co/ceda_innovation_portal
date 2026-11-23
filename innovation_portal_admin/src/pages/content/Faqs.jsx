import { useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core'
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { AlertTriangle, ArrowDown, ArrowUp, ChevronRight, GripVertical, MessageCircleQuestion, MoreHorizontal, Plus, Trash2 } from 'lucide-react'
import PageHeader from '../../components/ui/PageHeader'
import Button from '../../components/ui/Button'
import Input from '../../components/ui/Input'
import Textarea from '../../components/ui/Textarea'
import Select from '../../components/ui/Select'
import Modal from '../../components/ui/Modal'
import Tag from '../../components/ui/Tag'
import Tabs from '../../components/ui/Tabs'
import DropdownMenu from '../../components/ui/DropdownMenu'
import EmptyState from '../../components/ui/EmptyState'
import ErrorState from '../../components/ui/ErrorState'
import Skeleton from '../../components/ui/Skeleton'
import { Checkbox, Toggle } from '../../components/ui/Choice'
import { useConfirm } from '../../components/ui/confirm'
import { useToast } from '../../components/ui/toast'
import { useI18n, useT } from '../../i18n/context'
import { cn } from '../../lib/cn'
import { programs as programsApi } from '../../lib/api/endpoints'
import {
  NO_GROUP, PLACEMENTS, faqOrderPayload, faqProblems, fromFaq, groupFaqs, groupOrderPayload, missingSetswana, moveItem, sortGroups, toFaqPayload,
} from '../../lib/content/faqs'
import { useFaqAction, useFaqData } from '../../lib/queries/websiteContent'
import { useTrigger } from '../../components/ui/useTrigger'

const apiMessage = (err) => {
  const data = err?.data?.errors ?? err?.data ?? {}
  const first = Array.isArray(data) ? data[0] : typeof data === 'object' ? Object.values(data).flat()[0] : null
  return typeof first === 'string' ? first : err?.message ?? ''
}

function GroupRow({ group, count, index, total, selected, onSelect, onMove, menu }) {
  const t = useT()
  const sortable = useSortable({ id: group.id, disabled: group.id === NO_GROUP })
  const name = group.label
  return (
    <li ref={sortable.setNodeRef} style={{ transform: CSS.Transform.toString(sortable.transform), transition: sortable.transition }} className="list-none">
      <div className={cn('flex items-center gap-1 rounded-control pr-1', selected ? 'bg-primary-soft' : 'hover:bg-surface2')}>
        {group.id !== NO_GROUP ? (
          <button type="button" {...sortable.attributes} {...sortable.listeners} aria-label={t('quotes.dragHint')} className="flex h-9 w-6 cursor-grab touch-none items-center justify-center text-muted hover:text-text">
            <GripVertical size={14} aria-hidden />
          </button>
        ) : <span className="w-6" />}
        <button type="button" onClick={onSelect} aria-current={selected || undefined} className={cn('min-w-0 flex-1 py-2 text-left text-[14px]', selected ? 'font-bold text-primary' : 'font-semibold text-text')}>
          {name} <span className="font-normal text-muted">({count})</span>
        </button>
        {group.id !== NO_GROUP && (
          <>
            <button type="button" onClick={() => onMove(-1)} disabled={index === 0} aria-label={t('faqs.groupMoveUp', { name })} className="hidden h-7 w-6 items-center justify-center text-muted hover:text-text disabled:opacity-30 sm:flex"><ArrowUp size={13} aria-hidden /></button>
            <button type="button" onClick={() => onMove(1)} disabled={index === total - 1} aria-label={t('faqs.groupMoveDown', { name })} className="hidden h-7 w-6 items-center justify-center text-muted hover:text-text disabled:opacity-30 sm:flex"><ArrowDown size={13} aria-hidden /></button>
            {menu}
          </>
        )}
      </div>
    </li>
  )
}

function GroupDialog({ group, open, onClose, triggerRef }) {
  const t = useT()
  const toast = useToast()
  const act = useFaqAction()
  const [name, setName] = useState(group?.name ?? '')
  const [nameTn, setNameTn] = useState(group?.translations?.tn?.name ?? '')
  const [show, setShow] = useState(false)
  const save = async () => {
    setShow(true)
    if (!name.trim()) return
    const value = { name: name.trim(), translations: nameTn.trim() ? { tn: { name: nameTn.trim() } } : {} }
    try {
      if (group?.id) await act.mutateAsync({ action: 'updateGroup', id: group.id, value })
      else await act.mutateAsync({ action: 'createGroup', value })
      onClose()
    } catch (e) {
      toast.show({ tone: 'error', title: t('faqs.failed', { message: apiMessage(e) }) })
    }
  }
  return (
    <Modal open={open} onClose={onClose} triggerRef={triggerRef} title={group?.id ? t('faqs.renameGroup') : t('faqs.addGroup')} size="sm"
      footer={<><Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button><Button onClick={save} loading={act.isPending}>{t('faqs.saveGroup')}</Button></>}>
      <div className="flex flex-col gap-3">
        <Input label={t('faqs.groupName')} value={name} onChange={(e) => setName(e.target.value)} maxLength={120} required error={show && !name.trim() ? t('faqs.needGroupName') : undefined} />
        <Input label={t('faqs.groupNameTn')} value={nameTn} onChange={(e) => setNameTn(e.target.value)} maxLength={120} optional />
      </div>
    </Modal>
  )
}

/** Edits one question in place, in English and Setswana tabs. */
function FaqEditor({ faq, groupId, prefill, programs, onDone }) {
  const t = useT()
  const toast = useToast()
  const confirm = useConfirm()
  const act = useFaqAction()
  const [form, setForm] = useState(() => {
    const f = fromFaq(faq, groupId)
    return prefill ? { ...f, question: { ...f.question, en: prefill.text } } : f
  })
  const [lang, setLang] = useState('en')
  const [show, setShow] = useState(false)
  const problems = faqProblems(form)
  const err = (k) => (show && problems[k] ? t(problems[k]) : undefined)
  const setText = (key, value) => setForm((f) => ({ ...f, [key]: { ...f[key], [lang]: value } }))
  const togglePlace = (p, on) => setForm((f) => ({ ...f, placements: on ? [...new Set([...f.placements, p])] : f.placements.filter((x) => x !== p) }))

  async function save() {
    setShow(true)
    if (Object.keys(problems).length) {
      if (problems.question || problems.answer) setLang('en')
      return
    }
    try {
      const saved = faq?.id ? await act.mutateAsync({ action: 'update', id: faq.id, value: toFaqPayload(form) }) : await act.mutateAsync({ action: 'create', value: toFaqPayload(form) })
      if (prefill?.id && saved?.id) {
        await act.mutateAsync({ action: 'resolve', id: prefill.id, value: saved.id })
        toast.show({ tone: 'success', title: t('faqs.answered') })
      } else {
        toast.show({ tone: 'success', title: t('faqs.saved') })
      }
      onDone()
    } catch (e) {
      toast.show({ tone: 'error', title: t('faqs.failed', { message: apiMessage(e) }) })
    }
  }

  async function remove() {
    const ok = await confirm({ title: t('faqs.deleteTitle'), body: t('faqs.deleteBody', { question: faq.question }), confirmLabel: t('faqs.delete') })
    if (!ok) return
    try {
      await act.mutateAsync({ action: 'remove', id: faq.id })
      toast.show({ tone: 'success', title: t('faqs.deleted') })
      onDone()
    } catch (e) {
      toast.show({ tone: 'error', title: t('faqs.failed', { message: apiMessage(e) }) })
    }
  }

  const englishHint = (key) => (lang === 'tn' && form[key].en ? t('faqs.englishWas', { text: form[key].en.slice(0, 160) }) : undefined)
  return (
    <div className="flex flex-col gap-3 rounded-card border border-primary bg-surface p-4">
      <Tabs variant="segment" label={t('lang.label')} active={lang} onChange={setLang}
        tabs={[{ key: 'en', label: t('lang.en') }, { key: 'tn', label: t('lang.tn') }]} className="self-start" />
      <Input label={t('faqs.question')} value={form.question[lang]} onChange={(e) => setText('question', e.target.value)} maxLength={255} required={lang === 'en'} hint={englishHint('question')} error={lang === 'en' ? err('question') : undefined} />
      <Textarea label={t('faqs.answer')} value={form.answer[lang]} onChange={(e) => setText('answer', e.target.value)} rows={5} required={lang === 'en'} hint={englishHint('answer')} error={lang === 'en' ? err('answer') : undefined} />
      <fieldset className="flex flex-col gap-1">
        <legend className="mb-1 text-[13px] font-bold text-text">{t('faqs.showsOn')}</legend>
        <div className="grid gap-1 sm:grid-cols-2">
          {PLACEMENTS.map((p) => <Checkbox key={p} label={t(`faqs.place.${p}`)} checked={form.placements.includes(p)} onChange={(e) => togglePlace(p, e.target.checked)} />)}
        </div>
      </fieldset>
      {form.placements.includes('program') && (
        <Select label={t('faqs.program')} options={programs} value={form.program} onChange={(v) => setForm((f) => ({ ...f, program: v }))} required error={err('program')} />
      )}
      <Toggle label={t('faqs.public')} checked={form.is_public} onChange={(v) => setForm((f) => ({ ...f, is_public: v }))} />
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
        {faq?.id ? <Button variant="ghost" size="sm" icon={<Trash2 size={14} aria-hidden />} onClick={remove}>{t('faqs.delete')}</Button> : <span />}
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onDone}>{t('faqs.cancel')}</Button>
          <Button onClick={save} loading={act.isPending}>{t('faqs.save')}</Button>
        </div>
      </div>
    </div>
  )
}

/** 3.14 FAQs (Figma 33:551 website, 34:854 phone). */
export default function Faqs() {
  const t = useT()
  const { lang } = useI18n()
  const toast = useToast()
  const confirm = useConfirm()
  const data = useFaqData()
  const act = useFaqAction()
  const [selectedGroup, setSelectedGroup] = useState(null)
  const [editing, setEditing] = useState(null) // faq id, 'new' or null
  const [prefill, setPrefill] = useState(null)
  const [groupDialog, setGroupDialog] = useState(null) // group, 'new' or null
  const groupTrigger = useTrigger()
  const [order, setOrder] = useState(null)
  const editorTop = useRef(null)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }))
  const programsQuery = useQuery({ queryKey: ['programs', 'for-faqs'], queryFn: () => programsApi.list({ page_size: 100 }), staleTime: 5 * 60 * 1000 })
  const programs = (Array.isArray(programsQuery.data) ? programsQuery.data : programsQuery.data?.results ?? []).filter((p) => !p.is_general_intake).map((p) => ({ value: String(p.id), label: p.title }))

  const groups = useMemo(() => order ?? sortGroups(data.data?.groups ?? []), [order, data.data])
  const byGroup = useMemo(() => groupFaqs(data.data?.faqs ?? [], groups), [data.data, groups])
  const groupName = (g) => (lang === 'tn' && g.translations?.tn?.name) || g.name
  const groupRows = [...groups.map((g) => ({ ...g, id: String(g.id), label: groupName(g) })), ...(byGroup[NO_GROUP]?.length ? [{ id: NO_GROUP, label: t('faqs.noGroup') }] : [])]
  const current = groupRows.find((g) => g.id === selectedGroup) ?? groupRows[0] ?? null
  const questions = current ? byGroup[current.id] ?? [] : []
  const unanswered = data.data?.unanswered ?? []

  const saveGroupOrder = async (next) => {
    setOrder(next)
    try {
      await act.mutateAsync({ action: 'reorderGroups', value: groupOrderPayload(next) })
      await act.mutateAsync({ action: 'reorder', value: faqOrderPayload(next.map((g) => String(g.id)), groupFaqs(data.data?.faqs ?? [], next)) })
    } catch (e) {
      toast.show({ tone: 'error', title: t('faqs.failed', { message: apiMessage(e) }) })
    } finally {
      setOrder(null)
    }
  }
  const moveGroup = (index, delta) => {
    const target = groups[index + delta]
    if (target) saveGroupOrder(moveItem(groups, groups[index].id, target.id))
  }
  const moveQuestion = async (index, delta) => {
    const target = questions[index + delta]
    if (!target) return
    const next = { ...byGroup, [current.id]: moveItem(questions, questions[index].id, target.id) }
    try {
      await act.mutateAsync({ action: 'reorder', value: faqOrderPayload(groups.map((g) => String(g.id)), next) })
    } catch (e) {
      toast.show({ tone: 'error', title: t('faqs.failed', { message: apiMessage(e) }) })
    }
  }
  const removeGroup = async (g) => {
    const ok = await confirm({ title: t('faqs.deleteGroupTitle', { name: g.label }), body: t('faqs.deleteGroupBody'), confirmLabel: t('faqs.deleteGroup') })
    if (!ok) return
    try {
      await act.mutateAsync({ action: 'removeGroup', id: g.id })
      setSelectedGroup(null)
    } catch (e) {
      toast.show({ tone: 'error', title: t('faqs.failed', { message: apiMessage(e) }) })
    }
  }
  const answer = (q) => {
    setPrefill(q)
    setEditing('new')
    setTimeout(() => editorTop.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
  }

  if (data.isError) return <ErrorState title={t('faqs.loadError')} onRetry={() => data.refetch()} />

  const asking = (
    <section aria-labelledby="faqs-asking" className="rounded-card border border-border bg-surface p-4">
      <h2 id="faqs-asking" className="flex items-center gap-2 font-heading text-[15px] font-bold text-text"><MessageCircleQuestion size={16} aria-hidden /> {t('faqs.asking')}</h2>
      <p className="mb-3 text-[12px] text-muted">{t('faqs.askingBody')}</p>
      {unanswered.length === 0 ? <p className="text-[13px] text-muted">{t('faqs.askingNone')}</p> : (
        <ul className="flex flex-col divide-y divide-border">
          {unanswered.slice(0, 12).map((q) => (
            <li key={q.id} className="flex flex-col gap-1 py-2">
              <span className="text-[14px] font-semibold text-text">“{q.text}”</span>
              <span className="text-[12px] text-muted">
                {q.count === 1 ? t('faqs.askedOnce') : t('faqs.asked', { count: q.count })}
                {q.last_asked_at ? `, ${t('faqs.lastAsked', { date: new Date(q.last_asked_at).toLocaleDateString(lang === 'tn' ? 'en-BW' : 'en-GB', { day: 'numeric', month: 'short' }) })}` : ''}
                {q.source ? ` · ${t(`faqs.source.${q.source}`)}` : ''}
              </span>
              <button type="button" onClick={() => answer(q)} className="inline-flex items-center gap-1 self-start text-[13px] font-semibold text-primary hover:underline">
                {t('faqs.writeAnswer')} <ChevronRight size={13} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )

  return (
    <div>
      <p className="mb-1 text-[12px] text-muted"><Link to="/content/home" className="hover:underline">{t('news.crumb')}</Link> / {t('faqs.title')}</p>
      <PageHeader title={t('faqs.title')} subtitle={t('faqs.subtitle')}
        actions={<Button icon={<Plus size={15} aria-hidden />} onClick={() => { setPrefill(null); setEditing('new') }} disabled={!current}>{t('faqs.addQuestion')}</Button>} />

      {data.isLoading ? (
        <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]"><Skeleton className="h-72 rounded-card" /><Skeleton className="h-96 rounded-card" /></div>
      ) : groupRows.length === 0 ? (
        <div className="flex flex-col gap-4">
          <EmptyState title={t('faqs.empty')} message={t('faqs.emptyBody')} framed action={<Button onClick={(e) => { groupTrigger.from(e); setGroupDialog('new') }}>{t('faqs.addGroup')}</Button>} />
          {asking}
        </div>
      ) : (
        <div className="grid items-start gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
          <div className="flex flex-col gap-4 lg:col-start-1 lg:row-start-1">
            <section aria-labelledby="faqs-groups" className="rounded-card border border-border bg-surface p-3">
              <h2 id="faqs-groups" className="mb-2 px-1 font-heading text-[15px] font-bold text-text">{t('faqs.groups')}</h2>
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={({ active, over }) => over && active.id !== over.id && over.id !== NO_GROUP && saveGroupOrder(moveItem(groups.map((g) => ({ ...g, id: String(g.id) })), active.id, over.id))}>
                <SortableContext items={groupRows.map((g) => g.id)} strategy={verticalListSortingStrategy}>
                  <ul className="flex flex-col gap-0.5">
                    {groupRows.map((g, i) => (
                      <GroupRow key={g.id} group={g} count={(byGroup[g.id] ?? []).length} index={i} total={groups.length} selected={current?.id === g.id}
                        onSelect={() => { setSelectedGroup(g.id); setEditing(null) }} onMove={(d) => moveGroup(i, d)}
                        menu={<DropdownMenu label={t('faqs.groupActions', { name: g.label })} items={[
                          { key: 'rename', label: t('faqs.renameGroup'), onSelect: () => { groupTrigger.ref.current = null; setGroupDialog(groups.find((x) => String(x.id) === g.id)) } },
                          { key: 'delete', label: t('faqs.deleteGroup'), danger: true, onSelect: () => removeGroup(g) },
                        ]} trigger={(props) => <button type="button" {...props} className="flex h-7 w-7 items-center justify-center rounded text-muted hover:text-text"><MoreHorizontal size={15} aria-hidden /><span className="sr-only">{t('faqs.groupActions', { name: g.label })}</span></button>} />} />
                    ))}
                  </ul>
                </SortableContext>
              </DndContext>
              <button type="button" onClick={(e) => { groupTrigger.from(e); setGroupDialog('new') }} className="mt-2 inline-flex items-center gap-1 px-1 text-[13px] font-semibold text-primary hover:underline">
                <Plus size={13} aria-hidden /> {t('faqs.addGroup')}
              </button>
            </section>
          </div>

          <section aria-labelledby="faqs-questions" className="flex flex-col gap-2 lg:col-start-2 lg:row-span-2 lg:row-start-1">
            <div ref={editorTop} className="flex items-baseline justify-between gap-2">
              <h2 id="faqs-questions" className="font-heading text-[17px] font-bold text-text">{current ? t('faqs.questionsIn', { name: current.label }) : ''}</h2>
              <span className="text-[12px] text-muted">{t('faqs.count', { count: questions.length })}</span>
            </div>
            {editing === 'new' && current && (
              <FaqEditor key={`new-${prefill?.id ?? ''}`} groupId={current.id} prefill={prefill} programs={programs} onDone={() => { setEditing(null); setPrefill(null) }} />
            )}
            {questions.length === 0 && editing !== 'new' && <p className="rounded-card border border-dashed border-border p-4 text-[13px] text-muted">{t('faqs.noQuestions')}</p>}
            <ul className="flex flex-col gap-2">
              {questions.map((f, i) => (
                <li key={f.id}>
                  {editing === f.id ? (
                    <FaqEditor faq={f} programs={programs} onDone={() => setEditing(null)} />
                  ) : (
                    <div className="flex items-start gap-2 rounded-card border border-border bg-surface p-3">
                      <button type="button" onClick={() => setEditing(f.id)} aria-label={t('faqs.edit', { question: f.question })} className="min-w-0 flex-1 text-left">
                        <span className="block text-[14px] font-bold text-text">{(lang === 'tn' && f.translations?.tn?.question) || f.question}</span>
                        <span className="mt-0.5 line-clamp-2 block text-[13px] text-muted">{(lang === 'tn' && f.translations?.tn?.answer) || f.answer}</span>
                        <span className="mt-1.5 flex flex-wrap gap-1">
                          {(f.placements ?? []).map((p) => <Tag key={p} tone="neutral">{t(`faqs.place.${p}`)}</Tag>)}
                          {!f.is_public && <Tag tone="neutral">{t('faqs.hidden')}</Tag>}
                          {missingSetswana(f) && <Tag tone="amber" icon={<AlertTriangle size={11} aria-hidden />}>{t('faqs.missingTn')}</Tag>}
                        </span>
                      </button>
                      <span className="flex shrink-0 flex-col">
                        <button type="button" onClick={() => moveQuestion(i, -1)} disabled={i === 0} aria-label={t('faqs.moveUp')} className="flex h-7 w-7 items-center justify-center rounded text-muted hover:text-text disabled:opacity-30"><ArrowUp size={14} aria-hidden /></button>
                        <button type="button" onClick={() => moveQuestion(i, 1)} disabled={i === questions.length - 1} aria-label={t('faqs.moveDown')} className="flex h-7 w-7 items-center justify-center rounded text-muted hover:text-text disabled:opacity-30"><ArrowDown size={14} aria-hidden /></button>
                      </span>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </section>
          {/* One copy: under the groups on a wide screen, after the questions on a phone. */}
          <div className="lg:col-start-1 lg:row-start-2">{asking}</div>
        </div>
      )}

      {groupDialog && <GroupDialog key={groupDialog === 'new' ? 'new' : groupDialog.id} group={groupDialog === 'new' ? null : groupDialog} open onClose={() => setGroupDialog(null)} triggerRef={groupTrigger.ref} />}
    </div>
  )
}
