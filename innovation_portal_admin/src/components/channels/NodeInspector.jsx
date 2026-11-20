import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Flag, Plus, Trash2, X, AlertCircle, AlertTriangle } from 'lucide-react'
import Button from '../ui/Button'
import Input from '../ui/Input'
import Textarea from '../ui/Textarea'
import Select from '../ui/Select'
import Field from '../ui/Field'
import { Checkbox, Toggle } from '../ui/Choice'
import { programs as programsApi } from '../../lib/api/endpoints'
import { useAuth } from '../../lib/auth/AuthContext'
import { useT } from '../../i18n/context'
import { cn } from '../../lib/cn'
import { USSD_LIMIT, connect, portsOf, ussdScreenText } from './journeyModel'

const ANSWER_TYPES = ['text', 'number', 'date', 'yes_no', 'choice']
const LOOKUPS = ['open_challenges', 'idea_status', 'upcoming_events', 'faq']
const OPERATORS = ['equals', 'not_equals', 'is_set', 'not_set', 'contains', 'gt', 'lt']
const TOPICS = ['challenges', 'news', 'events', 'results']
const TEXT_LABEL = { lookup: 'ch.inspector.heading', save_draft: 'ch.inspector.confirmation', subscribe: 'ch.inspector.confirmation', handoff: 'ch.inspector.handoffPrompt' }

/** Side-by-side English and Setswana text, with the USSD character counter under each. */
function BilingualText({ label, value, onChange, rows = 3, counter }) {
  const t = useT()
  const text = value ?? {}
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {['en', 'tn'].map((lang) => (
        <div key={lang}>
          <Textarea
            label={`${label} · ${t(`lang.${lang}`)}`}
            rows={rows}
            value={text[lang] ?? ''}
            onChange={(e) => onChange({ ...text, [lang]: e.target.value })}
          />
          {counter && counter(lang)}
        </div>
      ))}
    </div>
  )
}

function UssdCounter({ node, lang }) {
  const t = useT()
  const length = ussdScreenText(node, lang).length
  const over = length > USSD_LIMIT
  return (
    <p className={cn('mt-1 text-d-cap tabular-nums', over ? 'text-danger font-bold' : 'text-muted')} aria-live="polite">
      {t('ch.inspector.ussdCount', { count: length, limit: USSD_LIMIT })}
    </p>
  )
}

function TargetSelect({ label, value, onChange, nodes, selfKey }) {
  const t = useT()
  const options = [
    { value: '', label: t('ch.inspector.nowhere') },
    ...nodes.filter((n) => n.key !== selfKey).map((n) => ({ value: n.key, label: `${n.title || t(`ch.type.${n.type}`)} (${n.key})` })),
  ]
  return <Select label={label} options={options} value={value ?? ''} onChange={onChange} />
}

function OptionList({ items, onChange, nodes, selfKey, withTargets, max, addLabel }) {
  const t = useT()
  const update = (index, patch) => onChange(items.map((item, i) => (i === index ? { ...item, ...patch } : item)))
  return (
    <div className="space-y-3">
      {items.map((item, index) => (
        <div key={index} className="rounded-control border border-border p-2.5 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-muted">{t('ch.inspector.option', { n: index + 1 })}</span>
            <button type="button" className="h-7 w-7 grid place-items-center rounded-control hover:bg-surface2" aria-label={t('ch.inspector.removeOption', { n: index + 1 })} onClick={() => onChange(items.filter((_, i) => i !== index))}>
              <X size={14} aria-hidden />
            </button>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {['en', 'tn'].map((lang) => (
              <Input key={lang} label={t(`lang.${lang}`)} value={item.label?.[lang] ?? ''} onChange={(e) => update(index, { label: { ...(item.label ?? {}), [lang]: e.target.value } })} />
            ))}
          </div>
          {withTargets && <TargetSelect label={t('ch.inspector.goesTo')} value={item.next} onChange={(next) => update(index, { next })} nodes={nodes} selfKey={selfKey} />}
        </div>
      ))}
      <Button variant="secondary" size="sm" icon={<Plus size={14} />} disabled={items.length >= max} onClick={() => onChange([...items, { label: { en: '', tn: '' }, next: '' }])}>
        {addLabel}
      </Button>
      {items.length >= max && <p className="text-d-cap text-muted">{t('ch.inspector.maxOptions', { max })}</p>}
    </div>
  )
}

function usePublishedPrograms() {
  const { can } = useAuth()
  return useQuery({
    queryKey: ['programs', { status: 'published', for: 'channels' }],
    queryFn: () => programsApi.list({ status: 'published', page_size: 100 }),
    enabled: can('challenges.manage'),
    staleTime: 5 * 60 * 1000,
  })
}

export default function NodeInspector({ node, nodes, channel, isStart, problems = [], onChange, onSetStart, onDelete, onClose }) {
  const t = useT()
  const settings = node.settings ?? {}
  const set = (patch) => onChange({ ...node, settings: { ...settings, ...patch } })
  const onUssd = channel === 'ussd' || channel === 'both'
  const variables = useMemo(() => {
    const names = new Set(['draft_reference'])
    nodes.forEach((n) => {
      if (n.settings?.variable) names.add(n.settings.variable)
      if (n.type === 'lookup' && n.settings?.save_as) names.add(n.settings.save_as)
    })
    return [...names].map((name) => ({ value: name, label: name }))
  }, [nodes])
  const programs = usePublishedPrograms()
  const programOptions = [
    { value: '', label: t('ch.inspector.generalIdeas') },
    ...((Array.isArray(programs.data) ? programs.data : programs.data?.results) ?? []).map((p) => ({ value: p.id, label: p.title })),
  ]
  const counter = onUssd && ['menu', 'question', 'message', 'end', 'language', 'handoff'].includes(node.type) ? (lang) => <UssdCounter node={node} lang={lang} /> : undefined
  const ports = portsOf(node, t)

  return (
    <aside aria-label={t('ch.inspector.label')} className="space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-d-cap text-muted">{t(`ch.type.${node.type}`)} · {node.key}</p>
          <h2 className="text-base font-bold text-text truncate">{node.title || t(`ch.type.${node.type}`)}</h2>
        </div>
        <button type="button" className="h-8 w-8 grid place-items-center rounded-control hover:bg-surface2" aria-label={t('common.close')} onClick={onClose}><X size={16} aria-hidden /></button>
      </div>

      {problems.length > 0 && (
        <ul className="space-y-1.5" aria-label={t('ch.inspector.problems')}>
          {problems.map((p, i) => (
            <li key={i} className={cn('flex gap-2 rounded-control px-2.5 py-2 text-xs', p.level === 'error' ? 'bg-danger-soft text-danger' : 'bg-warning-soft text-warning')}>
              {p.level === 'error' ? <AlertCircle size={14} className="shrink-0 mt-px" aria-hidden /> : <AlertTriangle size={14} className="shrink-0 mt-px" aria-hidden />}
              <span>{p.message}</span>
            </li>
          ))}
        </ul>
      )}

      <Input label={t('ch.inspector.title')} hint={t('ch.inspector.titleHint')} value={node.title ?? ''} maxLength={80} onChange={(e) => onChange({ ...node, title: e.target.value })} />

      {node.type !== 'condition' && (
        <BilingualText label={t(TEXT_LABEL[node.type] ?? 'ch.inspector.text')} value={node.text} onChange={(text) => onChange({ ...node, text })} counter={counter} />
      )}
      <p className="text-d-cap text-muted">{t('ch.inspector.variablesHint')}</p>

      {node.type === 'menu' && (
        <Field label={t('ch.inspector.options')}>
          <OptionList items={settings.options ?? []} onChange={(options) => set({ options })} nodes={nodes} selfKey={node.key} withTargets max={onUssd ? 8 : 10} addLabel={t('ch.inspector.addOption')} />
        </Field>
      )}

      {node.type === 'message' && (
        <Toggle label={t('ch.inspector.endsSession')} description={t('ch.inspector.endsSessionHint')} checked={!!settings.end} onChange={(end) => set({ end })} />
      )}

      {node.type === 'question' && (
        <div className="space-y-3">
          <Select label={t('ch.inspector.answerType')} options={ANSWER_TYPES.map((value) => ({ value, label: t(`ch.answer.${value}`) }))} value={settings.answer_type ?? 'text'} onChange={(answer_type) => set({ answer_type })} />
          <Input label={t('ch.inspector.variable')} hint={t('ch.inspector.variableHint')} value={settings.variable ?? ''} onChange={(e) => set({ variable: e.target.value.replace(/[^a-zA-Z0-9_]/g, '_') })} />
          {(settings.answer_type ?? 'text') === 'text' && <Input type="number" label={t('ch.inspector.maxLength')} value={settings.max_length ?? 160} onChange={(e) => set({ max_length: Number(e.target.value) || 160 })} />}
          {settings.answer_type === 'number' && (
            <div className="grid gap-2 grid-cols-2">
              <Input type="number" label={t('ch.inspector.min')} optional value={settings.min ?? ''} onChange={(e) => set({ min: e.target.value })} />
              <Input type="number" label={t('ch.inspector.max')} optional value={settings.max ?? ''} onChange={(e) => set({ max: e.target.value })} />
            </div>
          )}
          {settings.answer_type === 'choice' && (
            <Field label={t('ch.inspector.choices')}>
              <OptionList items={settings.choices ?? []} onChange={(choices) => set({ choices })} nodes={nodes} selfKey={node.key} max={onUssd ? 8 : 10} addLabel={t('ch.inspector.addChoice')} />
            </Field>
          )}
          <BilingualText label={t('ch.inspector.errorText')} rows={2} value={settings.error_text} onChange={(error_text) => set({ error_text })} />
          <Toggle label={t('ch.inspector.sensitive')} description={t('ch.inspector.sensitiveHint')} checked={!!settings.sensitive} onChange={(sensitive) => set({ sensitive })} />
        </div>
      )}

      {node.type === 'save_draft' && (
        <div className="space-y-3">
          {programs.isPending && programs.fetchStatus === 'idle' ? null : (
            <Select label={t('ch.inspector.challenge')} options={programOptions} value={settings.program_id ?? ''} onChange={(program_id) => set({ program_id: program_id || null })} />
          )}
          <Select label={t('ch.inspector.titleVariable')} options={variables} value={settings.title_variable ?? ''} onChange={(title_variable) => set({ title_variable })} />
          <Select label={t('ch.inspector.nameVariable')} options={[{ value: '', label: t('ch.inspector.none') }, ...variables]} value={settings.name_variable ?? ''} onChange={(name_variable) => set({ name_variable })} />
          <Field label={t('ch.inspector.fieldMap')} hint={t('ch.inspector.fieldMapHint')}>
            <div className="space-y-2">
              {Object.entries(settings.fields ?? {}).map(([field, variable]) => (
                <div key={field} className="flex items-center gap-2">
                  <span className="text-sm font-mono text-text truncate flex-1">{field}</span>
                  <span className="text-muted text-xs">{t('ch.inspector.from')}</span>
                  <span className="text-sm font-mono text-text truncate flex-1">{variable}</span>
                  <button type="button" className="h-7 w-7 grid place-items-center rounded-control hover:bg-surface2" aria-label={t('ch.inspector.removeMapping', { field })} onClick={() => { const fields = { ...(settings.fields ?? {}) }; delete fields[field]; set({ fields }) }}>
                    <X size={14} aria-hidden />
                  </button>
                </div>
              ))}
              <FieldMapAdder variables={variables} onAdd={(field, variable) => set({ fields: { ...(settings.fields ?? {}), [field]: variable } })} />
            </div>
          </Field>
          <Toggle label={t('ch.inspector.createAccount')} description={t('ch.inspector.createAccountHint')} checked={settings.create_account !== false} onChange={(create_account) => set({ create_account })} />
        </div>
      )}

      {node.type === 'lookup' && (
        <div className="space-y-3">
          <Select label={t('ch.inspector.lookup')} options={LOOKUPS.map((value) => ({ value, label: t(`ch.lookup.${value}`) }))} value={settings.lookup ?? ''} onChange={(lookup) => set({ lookup })} />
          {['idea_status', 'faq'].includes(settings.lookup) && (
            <Select label={t('ch.inspector.inputVariable')} options={[{ value: '', label: t('ch.inspector.none') }, ...variables]} value={settings.input_variable ?? ''} onChange={(input_variable) => set({ input_variable })} />
          )}
        </div>
      )}

      {node.type === 'condition' && (
        <div className="space-y-3">
          <Select label={t('ch.inspector.check')} options={[{ value: 'registered', label: t('ch.inspector.checkRegistered') }, { value: 'variable', label: t('ch.inspector.checkVariable') }]} value={settings.check ?? 'registered'} onChange={(check) => set({ check })} />
          {settings.check === 'variable' && (
            <>
              <Select label={t('ch.inspector.variable')} options={variables} value={settings.variable ?? ''} onChange={(variable) => set({ variable })} />
              <Select label={t('ch.inspector.operator')} options={OPERATORS.map((value) => ({ value, label: t(`ch.op.${value}`) }))} value={settings.operator ?? 'equals'} onChange={(operator) => set({ operator })} />
              {!['is_set', 'not_set'].includes(settings.operator) && <Input label={t('ch.inspector.value')} value={settings.value ?? ''} onChange={(e) => set({ value: e.target.value })} />}
            </>
          )}
        </div>
      )}

      {node.type === 'subscribe' && (
        <fieldset className="space-y-1.5">
          <legend className="text-sm font-bold text-text mb-1">{t('ch.inspector.topics')}</legend>
          {TOPICS.map((topic) => (
            <Checkbox key={topic} label={t(`ch.topic.${topic}`)} checked={(settings.topics ?? []).includes(topic)} onChange={(e) => set({ topics: e.target.checked ? [...(settings.topics ?? []), topic] : (settings.topics ?? []).filter((x) => x !== topic) })} />
          ))}
        </fieldset>
      )}

      {node.type === 'handoff' && (
        <div className="space-y-3">
          <p className="text-d-cap text-muted">{t('ch.inspector.handoffHint')}</p>
          <BilingualText label={t('ch.inspector.doneText')} rows={2} value={settings.done_text} onChange={(done_text) => set({ done_text })} />
        </div>
      )}

      {ports.length > 0 && node.type !== 'menu' && (
        <div className="space-y-2">
          {ports.map((port) => (
            <TargetSelect key={port.id} label={ports.length > 1 ? t('ch.inspector.goesToPort', { port: port.label }) : t('ch.inspector.goesTo')} value={port.target} onChange={(next) => onChange(connect(node, port.id, next))} nodes={nodes} selfKey={node.key} />
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-2 pt-2 border-t border-border">
        <Button variant="secondary" size="sm" icon={<Flag size={14} />} disabled={isStart} onClick={onSetStart}>{isStart ? t('ch.inspector.isStart') : t('ch.inspector.makeStart')}</Button>
        <Button variant="ghost" size="sm" icon={<Trash2 size={14} />} className="ml-auto text-danger" onClick={onDelete}>{t('ch.inspector.delete')}</Button>
      </div>
    </aside>
  )
}

function FieldMapAdder({ variables, onAdd }) {
  const t = useT()
  return (
    <form
      className="flex items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault()
        const form = new FormData(e.currentTarget)
        const field = String(form.get('field') || '').trim()
        const variable = String(form.get('variable') || '').trim()
        if (field && variable) {
          onAdd(field, variable)
          e.currentTarget.reset()
        }
      }}
    >
      <Input name="field" label={t('ch.inspector.formField')} placeholder="problem" fieldClassName="flex-1" />
      <Input name="variable" label={t('ch.inspector.variable')} placeholder={variables[1]?.value ?? 'title'} list="ch-variables" fieldClassName="flex-1" />
      <datalist id="ch-variables">{variables.map((v) => <option key={v.value} value={v.value} />)}</datalist>
      <Button type="submit" variant="secondary" size="sm">{t('ch.inspector.add')}</Button>
    </form>
  )
}
