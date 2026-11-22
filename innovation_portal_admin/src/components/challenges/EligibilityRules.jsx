import { useEffect, useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, FileText, Plus, X } from 'lucide-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import Button from '../ui/Button'
import { InputControl } from '../ui/Input'
import { SelectControl } from '../ui/Select'
import { MultiSelectControl } from '../ui/MultiSelect'
import Skeleton from '../ui/Skeleton'
import ErrorState from '../ui/ErrorState'
import { useI18n, useT } from '../../i18n/context'
import { client } from '../../lib/api/client'
import { useReferenceList } from '../../lib/queries/analytics'
import { pickText } from '../../lib/admin/roles'
import { cn } from '../../lib/cn'

// 3.6b Eligibility and requirements (Figma 135:1197 website, 135:1489 phone), on R-48's
// GET/PUT /api/programs/{id}/eligibility/ {rules, documents, sentence: {en, tn}}.
// ① Who can enter: rule blocks {field, operator, value}, all must be true. U10's yes/no questions (no field) stay as
// question rows. ② What applicants must bring, each Required or Optional. ③ In plain words, as the public 1.9 says it.
// The page's Save button saves this with the rest of the section (useEligibilityDraft().save).

const FIELDS = ['citizenship', 'age', 'district', 'sector', 'business_stage', 'registered_company']
const OPERATORS = {
  age: ['is_between', 'is_at_least'],
  citizenship: ['is', 'is_not'],
  district: ['is', 'is_not', 'is_one_of'],
  sector: ['is', 'is_not', 'is_one_of'],
  business_stage: ['is', 'is_not', 'is_one_of', 'is_at_least'],
  registered_company: ['is'],
}
const STAGES = ['idea', 'testing', 'selling', 'growing']
const key = () => Math.random().toString(36).slice(2)

/** The starting value when the field or operator changes, so a block is never left with a value of the wrong kind. */
function blankValue(field, operator) {
  if (field === 'age') return operator === 'is_between' ? [18, 35] : 18
  if (field === 'citizenship') return 'citizen'
  if (field === 'registered_company') return true
  if (field === 'business_stage') return operator === 'is_one_of' ? [] : 'idea'
  return operator === 'is_one_of' ? [] : ''
}

const eligibilityKey = (id) => ['programs', id, 'eligibility']

/** Loads the rules and documents and keeps an editable copy. available is false while the API has no R-48 (404/405). */
export function useEligibilityDraft(programId) {
  const qc = useQueryClient()
  const query = useQuery({
    queryKey: eligibilityKey(programId),
    queryFn: async () => {
      try {
        return await client.get(`/api/programs/${programId}/eligibility/`)
      } catch (err) {
        if (err?.status === 404 || err?.status === 405) return { unavailable: true }
        throw err
      }
    },
    enabled: !!programId,
  })
  const [draft, setDraft] = useState(null)
  useEffect(() => {
    if (!query.data || query.data.unavailable) return
    setDraft({
      rules: (query.data.rules ?? []).map((r) => ({ ...r, _key: r.id ?? key() })),
      documents: (query.data.documents ?? []).map((d) => ({ ...d, _key: d.id ?? key() })),
    })
  }, [query.data])

  const available = !!query.data && !query.data.unavailable
  const changed = available && draft && JSON.stringify(strip(draft)) !== JSON.stringify(strip({ rules: query.data.rules ?? [], documents: query.data.documents ?? [] }))

  async function save() {
    if (!changed) return
    const body = strip(draft)
    const res = await client.put(`/api/programs/${programId}/eligibility/`, body)
    qc.setQueryData(eligibilityKey(programId), res)
  }
  return { query, draft, setDraft, available, changed, save }
}

/** The PUT body: rules and documents in order, without the editor's keys or the read-only sentences. */
function strip(draft) {
  return {
    rules: draft.rules.map((r) => (r.field
      ? { id: r.id ?? null, field: r.field, operator: r.operator, value: r.value }
      : { id: r.id ?? null, question: r.question ?? '', help: r.help ?? '', required_answer: r.required_answer ?? true, reason: r.reason ?? '', active: r.active ?? true, translations: r.translations ?? {} })),
    documents: draft.documents.map((d) => ({ id: d.id ?? null, name: d.name ?? '', hint: d.hint ?? '', required: !!d.required, accept: d.accept ?? [], max_mb: d.max_mb ?? 5, translations: d.translations ?? {} })),
  }
}

function Segment({ label, options, value, onChange, size = 'md' }) {
  return (
    <div role="group" aria-label={label} className="inline-flex shrink-0 rounded-control bg-surface2 p-0.5">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'rounded-[6px] font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
            size === 'sm' ? 'px-2.5 py-1 text-[12px]' : 'px-3 py-1.5 text-[13px]',
            value === o.value ? 'bg-surface text-text shadow-sm' : 'text-muted hover:text-text',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

function ValueEditor({ rule, onChange, sectors, districts }) {
  const t = useT()
  const { field, operator, value } = rule
  const label = t('elg.value')
  if (field === 'age' && operator === 'is_between') {
    const [lo, hi] = Array.isArray(value) ? value : [18, 35]
    return (
      <div className="flex items-center gap-2">
        <InputControl type="number" min="0" max="120" aria-label={t('elg.ageFrom')} value={lo ?? ''} onChange={(e) => onChange([e.target.value === '' ? '' : Number(e.target.value), hi])} />
        <span className="text-[13px] text-muted">{t('elg.and')}</span>
        <InputControl type="number" min="0" max="120" aria-label={t('elg.ageTo')} value={hi ?? ''} onChange={(e) => onChange([lo, e.target.value === '' ? '' : Number(e.target.value)])} />
      </div>
    )
  }
  if (field === 'age') return <InputControl type="number" min="0" max="120" aria-label={label} value={value ?? ''} onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))} />
  if (field === 'citizenship') return <SelectControl aria-label={label} options={['citizen', 'resident'].map((v) => ({ value: v, label: t(`elg.citizenship.${v}`) }))} value={value ?? 'citizen'} onChange={onChange} />
  if (field === 'registered_company') return <SelectControl aria-label={label} options={[{ value: 'yes', label: t('elg.registered.yes') }, { value: 'no', label: t('elg.registered.no') }]} value={value === false ? 'no' : 'yes'} onChange={(v) => onChange(v === 'yes')} />
  const options = field === 'business_stage'
    ? STAGES.map((s) => ({ value: s, label: t(`elg.stage.${s}`) }))
    : (field === 'sector' ? sectors : districts)
  if (operator === 'is_one_of') return <MultiSelectControl aria-label={label} options={options} value={Array.isArray(value) ? value : []} onChange={onChange} placeholder={t('elg.pick')} />
  return <SelectControl aria-label={label} options={options} value={typeof value === 'string' ? value : ''} onChange={onChange} placeholder={t('elg.pick')} searchable={options.length > 8} />
}

export default function EligibilityRules({ draft: hook }) {
  const t = useT()
  const { lang } = useI18n()
  const [sentenceLang, setSentenceLang] = useState(lang)
  const sectors = useReferenceList('sectors', lang)
  const districts = useReferenceList('districts', lang)
  const refOptions = (data) => (data ?? []).map((r) => ({ value: String(r.id), label: pickText(r.name, lang) }))
  const sectorOptions = useMemo(() => refOptions(sectors.data), [sectors.data, lang]) // eslint-disable-line react-hooks/exhaustive-deps
  const districtOptions = useMemo(() => refOptions(districts.data), [districts.data, lang]) // eslint-disable-line react-hooks/exhaustive-deps

  const { query, draft, setDraft, available, changed } = hook
  if (query.isLoading || (available && !draft)) return <Skeleton className="h-64 rounded-card" />
  if (query.isError) return <ErrorState framed compact title={t('elg.loadError')} message={query.error?.message} onRetry={query.refetch} />
  if (!available) return <p className="rounded-control bg-surface2 px-3 py-2 text-[13px] text-muted">{t('cbs.rulesSoon')}</p>

  const setRules = (fn) => setDraft((d) => ({ ...d, rules: fn(d.rules) }))
  const setDocs = (fn) => setDraft((d) => ({ ...d, documents: fn(d.documents) }))
  const patchRule = (k, patch) => setRules((rs) => rs.map((r) => (r._key === k ? { ...r, ...patch } : r)))
  const patchDoc = (k, patch) => setDocs((ds) => ds.map((d) => (d._key === k ? { ...d, ...patch } : d)))
  const move = (items, i, by) => {
    const next = [...items]
    const [it] = next.splice(i, 1)
    next.splice(i + by, 0, it)
    return next
  }
  const sentence = query.data?.sentence?.[sentenceLang] || query.data?.sentence?.en

  return (
    <>
      <section aria-labelledby="elg-rules" className="rounded-card border border-border bg-surface p-[14px] 2xl:p-[22px]">
        <h2 id="elg-rules" className="text-[16px] font-bold text-text">{t('elg.rulesTitle')}</h2>
        <p className="mb-4 mt-1 text-[12px] text-muted">{t('elg.allTrue')}</p>
        {draft.rules.length === 0 && <p className="mb-3 text-[13px] text-muted">{t('elg.noRules')}</p>}
        <ol className="flex flex-col gap-3">
          {draft.rules.map((r, i) => (
            <li key={r._key} className="flex items-start gap-2">
              <div className="flex shrink-0 flex-col">
                <button type="button" className="btn-icon h-5 w-6" disabled={i === 0} aria-label={t('elg.moveUp')} onClick={() => setRules((rs) => move(rs, i, -1))}><ArrowUp size={12} aria-hidden /></button>
                <button type="button" className="btn-icon h-5 w-6" disabled={i === draft.rules.length - 1} aria-label={t('elg.moveDown')} onClick={() => setRules((rs) => move(rs, i, 1))}><ArrowDown size={12} aria-hidden /></button>
              </div>
              {r.field ? (
                <div className="grid min-w-0 flex-1 gap-2 md:grid-cols-[180px_140px_minmax(0,1fr)]">
                  <SelectControl
                    aria-label={t('elg.field')}
                    options={FIELDS.map((f) => ({ value: f, label: t(`elg.field.${f}`) }))}
                    value={r.field}
                    onChange={(f) => { const op = OPERATORS[f][0]; patchRule(r._key, { field: f, operator: op, value: blankValue(f, op) }) }}
                  />
                  <SelectControl
                    aria-label={t('elg.operator')}
                    options={OPERATORS[r.field].map((o) => ({ value: o, label: t(`elg.op.${o}`) }))}
                    value={r.operator}
                    onChange={(op) => patchRule(r._key, { operator: op, value: blankValue(r.field, op) })}
                  />
                  <ValueEditor rule={r} onChange={(v) => patchRule(r._key, { value: v })} sectors={sectorOptions} districts={districtOptions} />
                </div>
              ) : (
                <div className="min-w-0 flex-1">
                  <InputControl aria-label={t('elg.question')} value={r.question ?? ''} onChange={(e) => patchRule(r._key, { question: e.target.value })} />
                  <p className="mt-1 text-[12px] text-muted">{t('elg.questionHint')}</p>
                </div>
              )}
              <button type="button" className="btn-icon mt-1 shrink-0" aria-label={t('elg.removeRule')} onClick={() => setRules((rs) => rs.filter((x) => x._key !== r._key))}><X size={16} aria-hidden /></button>
            </li>
          ))}
        </ol>
        <Button
          variant="link"
          size="sm"
          className="mt-3"
          icon={<Plus size={14} aria-hidden />}
          onClick={() => setRules((rs) => [...rs, { _key: key(), field: 'citizenship', operator: 'is', value: 'citizen' }])}
        >
          {t('elg.addRule')}
        </Button>
      </section>

      <section aria-labelledby="elg-docs" className="rounded-card border border-border bg-surface p-[14px] 2xl:p-[22px]">
        <h2 id="elg-docs" className="mb-4 text-[16px] font-bold text-text">{t('elg.docsTitle')}</h2>
        {draft.documents.length === 0 && <p className="mb-3 text-[13px] text-muted">{t('elg.noDocs')}</p>}
        <ul className="flex flex-col gap-3">
          {draft.documents.map((d) => (
            <li key={d._key} className="flex flex-wrap items-start gap-3 sm:flex-nowrap">
              <FileText size={18} aria-hidden className="mt-2.5 shrink-0 text-muted" />
              <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-2">
                <InputControl aria-label={t('elg.docName')} placeholder={t('elg.docName')} value={d.name ?? ''} onChange={(e) => patchDoc(d._key, { name: e.target.value })} />
                <InputControl aria-label={t('elg.docHint')} placeholder={t('elg.docHintPlaceholder')} value={d.hint ?? ''} onChange={(e) => patchDoc(d._key, { hint: e.target.value })} />
              </div>
              <Segment label={t('elg.docNeeded', { name: d.name || t('elg.docName') })} options={[{ value: true, label: t('elg.required') }, { value: false, label: t('elg.optional') }]} value={!!d.required} onChange={(v) => patchDoc(d._key, { required: v })} />
              <button type="button" className="btn-icon shrink-0" aria-label={t('elg.removeDoc')} onClick={() => setDocs((ds) => ds.filter((x) => x._key !== d._key))}><X size={16} aria-hidden /></button>
            </li>
          ))}
        </ul>
        <Button variant="link" size="sm" className="mt-3" icon={<Plus size={14} aria-hidden />} onClick={() => setDocs((ds) => [...ds, { _key: key(), name: '', hint: '', required: true, accept: [], max_mb: 5 }])}>
          {t('elg.addDoc')}
        </Button>
      </section>

      <section aria-labelledby="elg-words" className="rounded-card bg-surface2 p-[14px] 2xl:p-[18px]">
        <div className="mb-2 flex items-center justify-between gap-3">
          <h2 id="elg-words" className="text-[12px] font-bold text-muted">{t('elg.plainWords')}</h2>
          <Segment size="sm" label={t('elg.plainWordsLang')} options={[{ value: 'en', label: 'English' }, { value: 'tn', label: 'Setswana' }]} value={sentenceLang} onChange={setSentenceLang} />
        </div>
        <p className="text-[14px] leading-6 text-text" lang={sentenceLang}>{sentence || t('elg.anyone')}</p>
        {changed && <p className="mt-2 text-[12px] text-muted">{t('elg.saveToUpdate')}</p>}
      </section>
    </>
  )
}
