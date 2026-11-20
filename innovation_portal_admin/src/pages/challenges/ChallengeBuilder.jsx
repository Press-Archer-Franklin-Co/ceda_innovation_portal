import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, FileText, Plus, Trash2, X } from 'lucide-react'
import PageHeader from '../../components/ui/PageHeader'
import Button from '../../components/ui/Button'
import Input, { InputControl } from '../../components/ui/Input'
import Textarea from '../../components/ui/Textarea'
import Select from '../../components/ui/Select'
import MultiSelect from '../../components/ui/MultiSelect'
import Modal from '../../components/ui/Modal'
import Tag from '../../components/ui/Tag'
import Avatar from '../../components/ui/Avatar'
import ErrorState from '../../components/ui/ErrorState'
import Skeleton from '../../components/ui/Skeleton'
import { useConfirm } from '../../components/ui/confirm'
import { useToast } from '../../components/ui/toast'
import JudgingEditor from '../../components/challenges/JudgingEditor'
import { useT } from '../../i18n/context'
import { cn } from '../../lib/cn'
import { client } from '../../lib/api/client'
import { programs as programsApi } from '../../lib/api/endpoints'
import { useProgram, useProgramTypes } from '../../lib/queries/programs'
import {
  formKeys, useAttachProgramForm, useForms, useProgramJudging, useProgramSetupStatus, useSaveProgramJudging,
} from '../../lib/queries/forms'
import { toPayload, total } from '../../lib/challenges/judging'

const STEPS = ['details', 'dates', 'support', 'judging', 'form', 'panel']
const TN_KEYS = ['summary', 'problem_statement', 'support_headline', 'who_can_enter', 'where']

function toInput(value) {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
const toIso = (value) => (value ? new Date(value).toISOString() : null)
const list = (data) => (Array.isArray(data) ? data : data?.results ?? [])

/** What the form holds for a program, with Setswana texts pulled out of `translations.tn`. */
function fromProgram(p) {
  const tn = p?.translations?.tn ?? {}
  return {
    title: p?.title ?? '',
    program_type_id: p?.program_type?.id ?? p?.program_type_id ?? '',
    sectors: (p?.sectors ?? []).map((s) => (typeof s === 'object' ? s.id : s)),
    summary: p?.summary ?? '',
    problem_statement: p?.problem_statement ?? '',
    who_can_enter: p?.who_can_enter ?? '',
    where: p?.where ?? '',
    what_we_look_for: (p?.what_we_look_for ?? []).map((x) => (typeof x === 'string' ? { en: x, tn: '' } : { en: x.en ?? '', tn: x.tn ?? '' })),
    tn: Object.fromEntries(TN_KEYS.map((k) => [k, tn[k] ?? ''])),
    opening_date: toInput(p?.opening_date),
    closing_date: toInput(p?.closing_date),
    next_panel_at: toInput(p?.next_panel_at),
    results_publish_at: toInput(p?.results_publish_at),
    support_headline: p?.support_headline ?? '',
    support_package: (p?.support_package ?? []).map((x) => ({
      title: typeof x.title === 'object' ? x.title : { en: x.title ?? '', tn: '' },
      amount_label: x.amount_label ?? '',
      description: typeof x.description === 'object' ? x.description : { en: x.description ?? '', tn: '' },
    })),
  }
}

function payloadFor(step, f) {
  const translations = { tn: Object.fromEntries(Object.entries(f.tn).filter(([, v]) => v.trim())) }
  if (step === 'details') {
    return {
      title: f.title.trim(),
      program_type_id: f.program_type_id,
      sectors: f.sectors,
      summary: f.summary,
      problem_statement: f.problem_statement,
      who_can_enter: f.who_can_enter,
      where: f.where,
      what_we_look_for: f.what_we_look_for.filter((x) => x.en.trim()),
      translations,
    }
  }
  if (step === 'dates') {
    return { opening_date: toIso(f.opening_date), closing_date: toIso(f.closing_date), next_panel_at: toIso(f.next_panel_at), results_publish_at: toIso(f.results_publish_at) }
  }
  if (step === 'support') {
    return { support_headline: f.support_headline, support_package: f.support_package.filter((x) => x.title.en.trim()), translations }
  }
  return {}
}

/** 3.6: the challenge builder in six steps; each step saves on its own. */
export default function ChallengeBuilder() {
  const { id } = useParams()
  const t = useT()
  const navigate = useNavigate()
  const toast = useToast()
  const qc = useQueryClient()
  const [params, setParams] = useSearchParams()
  const step = STEPS.includes(params.get('step')) ? params.get('step') : 'details'
  const program = useProgram(id)
  const setup = useProgramSetupStatus(id)
  const [form, setForm] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!id) setForm(fromProgram(null))
    else if (program.data) setForm(fromProgram(program.data))
  }, [id, program.data])

  useEffect(() => {
    document.title = `${id ? program.data?.title ?? '' : t('cb.titleNew')} · CEDA Innovation`
  }, [id, program.data, t])

  const done = useMemo(() => Object.fromEntries((setup.data?.steps ?? []).map((s) => [s.step, s.complete])), [setup.data])
  const goTo = (next) => setParams({ step: next }, { replace: true })
  const set = (patch) => setForm((prev) => ({ ...prev, ...patch }))

  async function saveStep(nextStep) {
    setError('')
    if (step === 'dates' && form.opening_date && form.closing_date && new Date(form.closing_date) <= new Date(form.opening_date)) {
      setError(t('cb.datesError'))
      return false
    }
    setSaving(true)
    try {
      const body = payloadFor(step, form)
      if (!id) {
        const created = await programsApi.create(body)
        qc.invalidateQueries({ queryKey: ['programs'] })
        navigate(`/programs/${created.id}/edit?step=${nextStep ?? 'dates'}`, { replace: true })
        return true
      }
      if (Object.keys(body).length) {
        await programsApi.update(id, body)
        qc.invalidateQueries({ queryKey: ['programs', id] })
      }
      qc.invalidateQueries({ queryKey: formKeys.setupStatus(id) })
      toast.show({ tone: 'success', title: t('cb.saved'), duration: 2500 })
      if (nextStep) goTo(nextStep)
      return true
    } catch (err) {
      const data = err?.data?.errors ?? err?.data ?? {}
      const first = typeof data === 'object' ? Object.values(data).flat()[0] : null
      setError(typeof first === 'string' ? first : err?.message || t('cb.saveError'))
      return false
    } finally {
      setSaving(false)
    }
  }

  if (id && program.isError) return <ErrorState title={t('cb.loadError')} message={program.error?.message} onRetry={program.refetch} framed />
  if (!form) return <Skeleton className="h-[520px] rounded-card" />

  const index = STEPS.indexOf(step)
  const next = STEPS[index + 1]
  const formStep = ['details', 'dates', 'support'].includes(step)

  return (
    <div className="flex flex-col gap-[14px] 2xl:gap-[22px]">
      <PageHeader
        back={<Link to={id ? `/programs/${id}` : '/programs'} className="text-[12px] text-muted hover:text-text hover:underline">{id ? t('cb.crumbEdit', { name: program.data?.title ?? '' }) : t('cb.crumbNew')}</Link>}
        title={id ? program.data?.title : t('cb.titleNew')}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {id && <Link to={`/programs/${id}/settings`} className="text-[13px] text-primary hover:underline">{t('cb.moreSettings')}</Link>}
            {formStep && <Button variant="secondary" size="sm" onClick={() => saveStep()} loading={saving} disabled={!form.title.trim() || !form.program_type_id}>{t('cb.saveDraft')}</Button>}
          </div>
        }
      />

      <div className="grid items-start gap-4 lg:grid-cols-[220px_minmax(0,1fr)] 2xl:grid-cols-[240px_minmax(0,1fr)]">
        <nav aria-label={t('steps.label')}>
          <ol className="flex flex-col gap-1">
            {STEPS.map((key, i) => {
              const complete = done[key]
              const current = key === step
              const locked = !id && key !== 'details'
              return (
                <li key={key}>
                  <button
                    type="button"
                    disabled={locked}
                    aria-current={current ? 'step' : undefined}
                    onClick={() => goTo(key)}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-control px-3 py-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50',
                      current ? 'bg-surface shadow-sm ring-1 ring-border' : 'hover:bg-surface2',
                    )}
                  >
                    <span className={cn('flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[12px] font-bold', complete ? 'bg-primary text-on-primary' : current ? 'bg-amber text-text' : 'bg-surface2 text-muted')}>
                      {complete ? <Check size={13} aria-hidden /> : i + 1}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[13px] font-bold text-text">{t(`cb.step.${key}`)}</span>
                      <span className="block truncate text-[11px] text-muted">{t(`cb.step.${key}Hint`)}</span>
                      <span className="sr-only">{complete ? t('cb.stepDone') : t('cb.stepTodo')}</span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ol>
          {!id && <p className="mt-3 text-[12px] text-muted">{t('cb.saveFirst')}</p>}
        </nav>

        <section className="min-w-0 rounded-card border border-border bg-surface p-[14px] 2xl:p-[22px]">
          {error && <p role="alert" className="mb-4 rounded-control bg-danger-soft px-3 py-2 text-[13px] text-danger">{error}</p>}
          {step === 'details' && <DetailsStep form={form} set={set} />}
          {step === 'dates' && <DatesStep form={form} set={set} />}
          {step === 'support' && <SupportStep form={form} set={set} />}
          {step === 'judging' && id && <JudgingStep programId={id} onDone={() => goTo('form')} />}
          {step === 'form' && id && <FormStep program={program.data} programId={id} />}
          {step === 'panel' && id && <PanelStep program={program.data} programId={id} done={done} />}

          {formStep && (
            <div className="mt-6 flex justify-between gap-2 border-t border-border pt-4">
              {index > 0 ? <Button variant="ghost" onClick={() => goTo(STEPS[index - 1])}>{t('cb.back')}</Button> : <span />}
              <Button onClick={() => saveStep(next)} loading={saving} disabled={!form.title.trim() || !form.program_type_id}>{t('cb.continue')}</Button>
            </div>
          )}
          {!formStep && (
            <div className="mt-6 flex justify-between gap-2 border-t border-border pt-4">
              <Button variant="ghost" onClick={() => goTo(STEPS[index - 1])}>{t('cb.back')}</Button>
              {next && <Button variant="secondary" onClick={() => goTo(next)}>{t('wizard.next')}</Button>}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

function Bilingual({ label, hint, en, tn, onEn, onTn, multiline }) {
  const t = useT()
  const Control = multiline ? Textarea : Input
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Control label={label} hint={hint} value={en} onChange={(e) => onEn(e.target.value)} rows={multiline ? 4 : undefined} />
      <Control label={`${label} (${t('cb.setswana')})`} value={tn} onChange={(e) => onTn(e.target.value)} rows={multiline ? 4 : undefined} optional />
    </div>
  )
}

function DetailsStep({ form, set }) {
  const t = useT()
  const types = useProgramTypes()
  const sectors = useQuery({ queryKey: ['reference', 'sectors'], queryFn: () => client.get('/api/reference/sectors/'), staleTime: 10 * 60 * 1000 })
  const setTn = (key, value) => set({ tn: { ...form.tn, [key]: value } })
  const points = form.what_we_look_for
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Input label={t('cb.name')} value={form.title} onChange={(e) => set({ title: e.target.value })} required maxLength={255} />
        <Select
          label={t('cb.type')}
          required
          options={list(types.data).map((x) => ({ value: x.id, label: x.name }))}
          value={form.program_type_id || null}
          onChange={(v) => set({ program_type_id: v })}
        />
      </div>
      <MultiSelect
        label={t('cb.sectors')}
        hint={t('cb.sectorsHint')}
        options={list(sectors.data).map((s) => ({ value: s.id, label: s.name }))}
        value={form.sectors}
        onChange={(v) => set({ sectors: v })}
      />
      <Bilingual label={t('cb.summary')} hint={t('cb.summaryHint')} en={form.summary} tn={form.tn.summary} onEn={(v) => set({ summary: v })} onTn={(v) => setTn('summary', v)} multiline />
      <Bilingual label={t('cb.problem')} en={form.problem_statement} tn={form.tn.problem_statement} onEn={(v) => set({ problem_statement: v })} onTn={(v) => setTn('problem_statement', v)} multiline />
      <Bilingual label={t('cb.whoCanEnter')} en={form.who_can_enter} tn={form.tn.who_can_enter} onEn={(v) => set({ who_can_enter: v })} onTn={(v) => setTn('who_can_enter', v)} />
      <Bilingual label={t('cb.where')} en={form.where} tn={form.tn.where} onEn={(v) => set({ where: v })} onTn={(v) => setTn('where', v)} />
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-[13px] font-bold text-text">{t('cb.lookFor')}</legend>
        {points.map((point, i) => (
          <div key={i} className="grid items-center gap-2 sm:grid-cols-[1fr_1fr_auto]">
            <InputControl aria-label={t('cb.lookForItem', { n: i + 1 })} value={point.en} onChange={(e) => set({ what_we_look_for: points.map((p, j) => (j === i ? { ...p, en: e.target.value } : p)) })} />
            <InputControl aria-label={`${t('cb.lookForItem', { n: i + 1 })} (${t('cb.setswana')})`} value={point.tn} onChange={(e) => set({ what_we_look_for: points.map((p, j) => (j === i ? { ...p, tn: e.target.value } : p)) })} leading={<span className="text-[11px] font-bold">TN</span>} />
            <button type="button" onClick={() => set({ what_we_look_for: points.filter((_, j) => j !== i) })} aria-label={t('cb.removePoint', { n: i + 1 })} className="flex h-9 w-9 items-center justify-center rounded-control text-muted hover:text-danger">
              <X size={15} aria-hidden />
            </button>
          </div>
        ))}
        {points.length < 10 && (
          <button type="button" onClick={() => set({ what_we_look_for: [...points, { en: '', tn: '' }] })} className="inline-flex items-center gap-1 self-start text-[13px] text-primary hover:underline">
            <Plus size={13} aria-hidden /> {t('cb.addPoint')}
          </button>
        )}
      </fieldset>
    </div>
  )
}

function DatesStep({ form, set }) {
  const t = useT()
  const field = (key, label) => <Input key={key} type="datetime-local" label={label} value={form[key]} onChange={(e) => set({ [key]: e.target.value })} />
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {field('opening_date', t('cb.opens'))}
      {field('closing_date', t('cb.closes'))}
      {field('next_panel_at', t('cb.nextPanel'))}
      {field('results_publish_at', t('cb.results'))}
    </div>
  )
}

function SupportStep({ form, set }) {
  const t = useT()
  const items = form.support_package
  const update = (i, patch) => set({ support_package: items.map((x, j) => (j === i ? { ...x, ...patch } : x)) })
  return (
    <div className="flex flex-col gap-4">
      <Bilingual label={t('cb.headline')} hint={t('cb.headlineHint')} en={form.support_headline} tn={form.tn.support_headline} onEn={(v) => set({ support_headline: v })} onTn={(v) => set({ tn: { ...form.tn, support_headline: v } })} />
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-[13px] font-bold text-text">{t('cb.package')}</legend>
        {items.map((item, i) => (
          <div key={i} className="flex flex-col gap-2 rounded-control border border-border p-3">
            <div className="grid gap-2 sm:grid-cols-[1fr_1fr_160px_auto]">
              <Input label={t('cb.packageTitle')} value={item.title.en} onChange={(e) => update(i, { title: { ...item.title, en: e.target.value } })} />
              <Input label={`${t('cb.packageTitle')} (${t('cb.setswana')})`} value={item.title.tn ?? ''} onChange={(e) => update(i, { title: { ...item.title, tn: e.target.value } })} optional />
              <Input label={t('cb.packageAmount')} value={item.amount_label} onChange={(e) => update(i, { amount_label: e.target.value })} optional />
              <button type="button" onClick={() => set({ support_package: items.filter((_, j) => j !== i) })} aria-label={t('cb.removeSupport')} className="mt-6 flex h-9 w-9 items-center justify-center rounded-control text-muted hover:text-danger">
                <Trash2 size={15} aria-hidden />
              </button>
            </div>
            <Bilingual label={t('cb.packageDescription')} en={item.description.en} tn={item.description.tn ?? ''} onEn={(v) => update(i, { description: { ...item.description, en: v } })} onTn={(v) => update(i, { description: { ...item.description, tn: v } })} />
          </div>
        ))}
        <button type="button" onClick={() => set({ support_package: [...items, { title: { en: '', tn: '' }, amount_label: '', description: { en: '', tn: '' } }] })} className="inline-flex items-center gap-1 self-start text-[13px] text-primary hover:underline">
          <Plus size={13} aria-hidden /> {t('cb.addSupport')}
        </button>
      </fieldset>
    </div>
  )
}

function JudgingStep({ programId, onDone }) {
  const t = useT()
  const toast = useToast()
  const judging = useProgramJudging(programId)
  const save = useSaveProgramJudging(programId)
  const [value, setValue] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => {
    if (judging.data) setValue({ criteria: judging.data.criteria ?? [], pass_mark: judging.data.pass_mark ?? '', reviewers_per_idea: judging.data.reviewers_per_idea ?? '' })
  }, [judging.data])
  if (judging.isError) return <ErrorState title={t('mc.loadError')} onRetry={judging.refetch} compact />
  if (!value) return <Skeleton className="h-[300px] rounded-card" />
  const ok = Math.abs(total(value.criteria) - 100) < 0.001
  async function onSave() {
    setError('')
    try {
      await save.mutateAsync(toPayload(value))
      toast.show({ tone: 'success', title: t('mc.saved') })
      onDone()
    } catch (err) {
      const data = err?.data?.errors ?? err?.data ?? {}
      setError(String(data.weights || data.criteria || err?.message || t('common.somethingWrong')))
    }
  }
  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-[18px] font-bold text-text">{t('cb.judgingTitle')}</h2>
      <p className="text-[13px] text-muted">{t('cb.judgingIntro')}</p>
      {error && <p role="alert" className="text-[13px] text-danger">{error}</p>}
      <JudgingEditor value={value} onChange={setValue} variant="compact" />
      <div className="flex justify-end">
        <Button onClick={onSave} loading={save.isPending} disabled={!ok}>{t('mc.save')}</Button>
      </div>
    </div>
  )
}

function FormStep({ program, programId }) {
  const t = useT()
  const toast = useToast()
  const qc = useQueryClient()
  const attach = useAttachProgramForm(programId)
  const live = useForms({ status: 'live' })
  const [choosing, setChoosing] = useState(false)
  const [chosen, setChosen] = useState(null)
  const changeRef = useRef(null)
  const summary = program?.form_summary
  async function onAttach() {
    try {
      await attach.mutateAsync(chosen)
      qc.invalidateQueries({ queryKey: ['programs', programId] })
      toast.show({ tone: 'success', title: t('cb.attached') })
      setChoosing(false)
    } catch (err) {
      toast.show({ tone: 'error', title: err?.message || t('common.somethingWrong') })
    }
  }
  const forms = (live.data?.results ?? []).filter((f) => !f.is_template)
  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-[18px] font-bold text-text">{t('cb.formTitle')}</h2>
      <div className="flex flex-wrap items-center gap-4 rounded-card border border-border bg-surface2 p-4">
        <span className="flex h-10 w-10 items-center justify-center rounded-control bg-surface text-muted"><FileText size={20} aria-hidden /></span>
        <div className="min-w-0 flex-1">
          {summary ? (
            <>
              <p className="text-[14px] font-bold text-text">
                {summary.version_number ? t('cb.formCard', { name: summary.name, n: summary.version_number }) : summary.name}
                {!summary.version_number && <Tag tone="amber" className="ml-2">{t('cb.formNotPublished')}</Tag>}
              </p>
              <p className="text-[12px] text-muted">{t('cb.formFacts', { steps: summary.step_count ?? 0, questions: summary.question_count ?? 0, challenge: summary.challenge_question_count ?? 0 })}</p>
              <Link to={`/forms/${summary.form_id}`} className="text-[12px] text-primary hover:underline">{t('cb.openForm')}</Link>
            </>
          ) : (
            <p className="text-[13px] text-muted">{t('cb.formNone')}</p>
          )}
        </div>
        <Button ref={changeRef} variant="secondary" size="sm" onClick={() => setChoosing(true)}>{t('cb.changeForm')}</Button>
      </div>
      <Modal
        open={choosing}
        onClose={() => setChoosing(false)}
        triggerRef={changeRef}
        title={t('cb.pickForm')}
        footer={<Button onClick={onAttach} loading={attach.isPending} disabled={!chosen}>{t('cb.attach')}</Button>}
      >
        {live.isLoading ? (
          <Skeleton className="h-24" />
        ) : forms.length === 0 ? (
          <p className="text-[13px] text-muted">{t('cb.noPublishedForms')}</p>
        ) : (
          <div role="radiogroup" aria-label={t('cb.pickForm')} className="flex flex-col gap-2">
            {forms.map((f) => (
              <button key={f.id} type="button" role="radio" aria-checked={chosen === f.id} onClick={() => setChosen(f.id)}
                className={cn('rounded-control border p-3 text-left', chosen === f.id ? 'border-2 border-primary bg-primary-soft' : 'border-border hover:bg-surface2')}>
                <span className="block text-[13px] font-bold text-text">{f.name}</span>
                <span className="block text-[12px] text-muted">{t('forms.questions', { count: f.question_count ?? 0 })}</span>
              </button>
            ))}
          </div>
        )}
      </Modal>
    </div>
  )
}

function PanelStep({ program, programId, done }) {
  const t = useT()
  const toast = useToast()
  const confirm = useConfirm()
  const qc = useQueryClient()
  const judges = useQuery({ queryKey: ['programs', programId, 'judges'], queryFn: () => programsApi.judges(programId) })
  const [inviting, setInviting] = useState(false)
  const [invite, setInvite] = useState({ name: '', email: '', organisation: '' })
  const [busy, setBusy] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const inviteRef = useRef(null)
  const missing = STEPS.filter((s) => s !== 'panel' && !done[s])

  async function sendInvite() {
    setBusy(true)
    try {
      await programsApi.addJudge(programId, { name: invite.name.trim(), email: invite.email.trim(), organisation: invite.organisation.trim() })
      qc.invalidateQueries({ queryKey: ['programs', programId, 'judges'] })
      qc.invalidateQueries({ queryKey: formKeys.setupStatus(programId) })
      toast.show({ tone: 'success', title: t('cb.invited', { name: invite.name.trim() }) })
      setInvite({ name: '', email: '', organisation: '' })
      setInviting(false)
    } catch (err) {
      toast.show({ tone: 'error', title: err?.message || t('common.somethingWrong') })
    } finally {
      setBusy(false)
    }
  }

  async function removeJudge(judge) {
    const ok = await confirm({ title: t('cb.removeJudgeTitle', { name: judge.name }), body: t('cb.removeJudgeBody'), confirmLabel: t('cb.removeJudge', { name: judge.name }) })
    if (!ok) return
    try {
      await programsApi.removeJudge(programId, judge.id)
      qc.invalidateQueries({ queryKey: ['programs', programId, 'judges'] })
      qc.invalidateQueries({ queryKey: formKeys.setupStatus(programId) })
    } catch (err) {
      toast.show({ tone: 'error', title: err?.message || t('common.somethingWrong') })
    }
  }

  async function publish() {
    setPublishing(true)
    try {
      await programsApi.publish(programId)
      qc.invalidateQueries({ queryKey: ['programs'] })
      toast.show({ tone: 'success', title: t('cb.published') })
    } catch (err) {
      const data = err?.data?.errors ?? err?.data ?? {}
      const first = typeof data === 'object' ? Object.values(data).flat()[0] : null
      toast.show({ tone: 'error', title: typeof first === 'string' ? first : err?.message || t('common.somethingWrong') })
    } finally {
      setPublishing(false)
    }
  }

  const people = list(judges.data)
  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-card border border-border p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-[16px] font-bold text-text">{t('cb.panel')}</h2>
          <Button ref={inviteRef} size="sm" variant="secondary" onClick={() => setInviting(true)}><Plus size={14} aria-hidden /> {t('cb.invite')}</Button>
        </div>
        <p className="mt-1 text-[12px] text-muted">{t('cb.panelIntro')}</p>
        {judges.isLoading ? (
          <Skeleton className="mt-3 h-10" />
        ) : judges.isError ? (
          <ErrorState title={t('common.somethingWrong')} onRetry={judges.refetch} compact />
        ) : people.length === 0 ? (
          <p className="mt-3 text-[13px] text-muted">{t('cb.panelEmpty')}</p>
        ) : (
          <ul className="mt-3 flex flex-wrap gap-2">
            {people.map((j) => (
              <li key={j.id} className="flex items-center gap-2 rounded-full border border-border py-1 pl-1 pr-2">
                <Avatar name={j.name} size="xs" decorative />
                <span className="text-[13px] text-text">{[j.name, j.organisation].filter(Boolean).join(', ')}</span>
                <Tag tone={j.status === 'accepted' ? 'green' : 'neutral'}>{t(`cb.judgeStatus.${j.status}`)}</Tag>
                <button type="button" onClick={() => removeJudge(j)} aria-label={t('cb.removeJudge', { name: j.name })} className="flex h-7 w-7 items-center justify-center rounded-full text-muted hover:text-danger">
                  <X size={13} aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-card bg-surface2 p-4">
        <p className="text-[13px] text-text">
          {program?.status === 'published' ? t('cb.isLive') : missing.length ? t('cb.publishBlocked', { steps: missing.map((s) => t(`cb.step.${s}`)).join(', ') }) : ''}
        </p>
        {program?.status !== 'published' && (
          <Button onClick={publish} loading={publishing} disabled={missing.length > 0}>{t('cb.publish')}</Button>
        )}
      </div>

      <Modal
        open={inviting}
        onClose={() => setInviting(false)}
        triggerRef={inviteRef}
        title={t('cb.inviteTitle')}
        footer={<Button onClick={sendInvite} loading={busy} disabled={!invite.name.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(invite.email.trim())}>{t('cb.inviteSend')}</Button>}
      >
        <div className="flex flex-col gap-3">
          <Input label={t('cb.judgeName')} value={invite.name} onChange={(e) => setInvite((v) => ({ ...v, name: e.target.value }))} required autoFocus />
          <Input label={t('cb.judgeEmail')} type="email" value={invite.email} onChange={(e) => setInvite((v) => ({ ...v, email: e.target.value }))} required />
          <Input label={t('cb.judgeOrg')} value={invite.organisation} onChange={(e) => setInvite((v) => ({ ...v, organisation: e.target.value }))} optional />
        </div>
      </Modal>
    </div>
  )
}
