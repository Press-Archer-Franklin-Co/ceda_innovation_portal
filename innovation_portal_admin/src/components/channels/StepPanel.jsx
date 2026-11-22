import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AlertCircle, AlertTriangle, Flag, Plus, Trash2, X } from 'lucide-react'
import Button from '../ui/Button'
import Input from '../ui/Input'
import Textarea from '../ui/Textarea'
import Select from '../ui/Select'
import Field from '../ui/Field'
import Tabs from '../ui/Tabs'
import { Checkbox, Toggle } from '../ui/Choice'
import { programs as programsApi } from '../../lib/api/endpoints'
import { useAuth } from '../../lib/auth/AuthContext'
import { useI18n } from '../../i18n/context'
import { cn } from '../../lib/cn'
import { USSD_LIMIT, connect, pick, portsOf, ussdScreenText, variablesOf } from './journeyModel'

// The edit panel of both builders (3.31 box settings, 3.31b block settings). Drawn from the step type's
// settings in GET /api/channels/node-types/, so a type the API adds later gets a working panel too.
// English and Setswana are tabs (Figma); `lang` is the tab, the labels follow the console language.

function usePublishedPrograms(enabled) {
  const { can } = useAuth()
  return useQuery({
    queryKey: ['programs', { status: 'published', for: 'channels' }],
    queryFn: () => programsApi.list({ status: 'published', page_size: 100 }),
    enabled: enabled && can('challenges.manage'),
    staleTime: 5 * 60 * 1000,
  })
}

function visible(field, settings) {
  if (!field.show_if) return true
  return field.show_if.in.includes(settings[field.show_if.field])
}

function StepOptions({ field, items, lang, nodes, selfKey, withTargets, max, onChange, ui }) {
  const { t } = useI18n()
  const update = (index, patch) => onChange(items.map((item, i) => (i === index ? { ...item, ...patch } : item)))
  return (
    <Field label={ui(field)}>
      <ol className="space-y-2">
        {items.map((item, index) => (
          <li key={index} className="rounded-control border border-border p-2.5 space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-d-cap font-bold text-muted w-5 shrink-0">{index + 1}.</span>
              <Input
                label={t('ch.step.optionLabel', { n: index + 1 })}
                hideLabel
                fieldClassName="flex-1"
                value={item.label?.[lang] ?? ''}
                placeholder={lang === 'tn' ? item.label?.en ?? '' : ''}
                onChange={(e) => update(index, { label: { ...(item.label ?? {}), [lang]: e.target.value } })}
              />
              <button type="button" className="h-8 w-8 grid place-items-center rounded-control hover:bg-surface2" aria-label={t('ch.step.removeOption', { n: index + 1 })} onClick={() => onChange(items.filter((_, i) => i !== index))}>
                <X size={14} aria-hidden />
              </button>
            </div>
            {withTargets && <TargetSelect label={t('ch.step.optionGoesTo', { n: index + 1 })} value={item.next} nodes={nodes} selfKey={selfKey} onChange={(next) => update(index, { next })} />}
          </li>
        ))}
      </ol>
      <div className="mt-2 flex items-center gap-3">
        <Button variant="secondary" size="sm" icon={<Plus size={14} />} disabled={items.length >= max} onClick={() => onChange([...items, { label: { en: '', tn: '' }, next: '' }])}>
          {t('ch.step.addOption')}
        </Button>
        <span className="text-d-cap text-muted">{t('ch.step.maxOptions', { max })}</span>
      </div>
    </Field>
  )
}

function TargetSelect({ label, value, nodes, selfKey, onChange }) {
  const { t, lang } = useI18n()
  const options = [
    { value: '', label: t('ch.step.nowhere') },
    ...nodes.filter((n) => n.key !== selfKey).map((n) => ({ value: n.key, label: n.title || pick(n.text, lang) || n.key })),
  ]
  return <Select label={label} options={options} value={value ?? ''} onChange={onChange} />
}

function MappingRows({ field, value, variables, onChange, ui }) {
  const { t } = useI18n()
  const rows = Object.entries(value ?? {})
  return (
    <Field label={ui(field)} hint={t('ch.step.mappingHint')}>
      <ul className="space-y-2">
        {rows.map(([formField, variable], index) => (
          <li key={index} className="flex items-end gap-2">
            <Input label={t('ch.step.formField')} hideLabel={index > 0} fieldClassName="flex-1" value={formField} onChange={(e) => {
              const next = Object.fromEntries(rows.map(([k, v], i) => (i === index ? [e.target.value.replace(/[^a-z0-9_]/gi, '_'), v] : [k, v])))
              onChange(next)
            }} />
            <Select label={t('ch.step.fromAnswer')} hideLabel={index > 0} fieldClassName="flex-1" options={variables.map((v) => ({ value: v, label: v }))} value={variable} onChange={(v) => onChange(Object.fromEntries(rows.map(([k, old], i) => [k, i === index ? v : old])))} />
            <button type="button" className="h-9 w-8 grid place-items-center rounded-control hover:bg-surface2" aria-label={t('ch.step.removeMapping', { field: formField || index + 1 })} onClick={() => onChange(Object.fromEntries(rows.filter((_, i) => i !== index)))}>
              <X size={14} aria-hidden />
            </button>
          </li>
        ))}
      </ul>
      <Button className="mt-2" variant="secondary" size="sm" icon={<Plus size={14} />} onClick={() => onChange({ ...(value ?? {}), '': variables[0] ?? '' })} disabled={'' in (value ?? {})}>
        {t('ch.step.addMapping')}
      </Button>
    </Field>
  )
}

export default function StepPanel({ node, nodes, types, channel, lang, onLang, isStart, problems = [], onChange, onSetStart, onDelete, onClose }) {
  const { t, lang: uiLang } = useI18n()
  const spec = types[node.type]
  const settings = node.settings ?? {}
  const set = (patch) => onChange({ ...node, settings: { ...settings, ...patch } })
  const ui = (item) => (uiLang === 'tn' && item.label_tn ? item.label_tn : item.label)
  const variables = useMemo(() => variablesOf(nodes, types), [nodes, types])
  const needsPrograms = (spec?.fields ?? []).some((f) => f.kind === 'program')
  const programs = usePublishedPrograms(needsPrograms)
  const programList = (Array.isArray(programs.data) ? programs.data : programs.data?.results) ?? []
  const ussd = channel === 'ussd'
  const screenLength = ussdScreenText(node, lang, types).length
  const nextPort = portsOf(node, types).find((p) => p.id === 'next')

  return (
    <aside aria-label={t('ch.step.panel')} className="space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-d-cap text-muted">{spec ? ui(spec) : t('ch.status.unknown')}</p>
          <h2 className="text-base font-bold text-text truncate">{node.title || pick(node.text, uiLang) || (spec ? ui(spec) : node.key)}</h2>
        </div>
        {onClose && <button type="button" className="h-8 w-8 grid place-items-center rounded-control hover:bg-surface2" aria-label={t('common.close')} onClick={onClose}><X size={16} aria-hidden /></button>}
      </div>

      <Tabs variant="segment" label={t('ch.step.language')} tabs={[{ key: 'en', label: t('lang.en') }, { key: 'tn', label: t('lang.tn') }]} active={lang} onChange={onLang} />

      {problems.length > 0 && (
        <ul className="space-y-1.5" aria-label={t('ch.step.problems')}>
          {problems.map((p, i) => (
            <li key={i} className={cn('flex gap-2 rounded-control px-2.5 py-2 text-xs', p.level === 'error' ? 'bg-danger-soft text-danger' : 'bg-warning-soft text-warning')}>
              {p.level === 'error' ? <AlertCircle size={14} className="shrink-0 mt-px" aria-hidden /> : <AlertTriangle size={14} className="shrink-0 mt-px" aria-hidden />}
              <span>{p.message}</span>
            </li>
          ))}
        </ul>
      )}

      {spec?.text && (
        <div>
          <Textarea
            label={ui(spec.text)}
            rows={3}
            value={node.text?.[lang] ?? ''}
            placeholder={lang === 'tn' ? node.text?.en ?? '' : ''}
            onChange={(e) => onChange({ ...node, text: { ...(node.text ?? {}), [lang]: e.target.value } })}
          />
          {ussd && (
            <p className={cn('mt-1 text-right text-d-cap tabular-nums', screenLength > USSD_LIMIT ? 'text-danger font-bold' : 'text-muted')} aria-live="polite">
              {t('ch.step.count', { count: screenLength, limit: USSD_LIMIT })}
            </p>
          )}
          <p className="mt-1 text-d-cap text-muted">{t('ch.step.variablesHint')}</p>
        </div>
      )}

      {(spec?.fields ?? []).filter((f) => visible(f, settings)).map((field) => {
        const value = settings[field.name]
        switch (field.kind) {
          case 'options':
          case 'choices':
            return (
              <StepOptions key={field.name} field={field} items={value ?? []} lang={lang} nodes={nodes} selfKey={node.key} ui={ui}
                withTargets={field.kind === 'options'} max={ussd ? field.max_ussd ?? 8 : field.max_whatsapp ?? 10} onChange={(items) => set({ [field.name]: items })} />
            )
          case 'boolean':
            return <Toggle key={field.name} label={ui(field)} checked={!!value} onChange={(v) => set({ [field.name]: v })} />
          case 'select':
            return <Select key={field.name} label={ui(field)} options={field.choices.map((c) => ({ value: c.value, label: ui(c) }))} value={value ?? ''} onChange={(v) => set({ [field.name]: v })} />
          case 'multi':
            return (
              <fieldset key={field.name} className="space-y-1.5">
                <legend className="text-[13px] font-bold text-text mb-1">{ui(field)}</legend>
                {field.choices.map((c) => (
                  <Checkbox key={c.value} label={ui(c)} checked={(value ?? []).includes(c.value)}
                    onChange={(e) => set({ [field.name]: e.target.checked ? [...(value ?? []), c.value] : (value ?? []).filter((x) => x !== c.value) })} />
                ))}
              </fieldset>
            )
          case 'bilingual':
            return <Textarea key={field.name} label={ui(field)} optional={field.optional} rows={2} value={value?.[lang] ?? ''} placeholder={lang === 'tn' ? value?.en ?? '' : ''} onChange={(e) => set({ [field.name]: { ...(value ?? {}), [lang]: e.target.value } })} />
          case 'node':
            return <TargetSelect key={field.name} label={ui(field)} value={value} nodes={nodes} selfKey={node.key} onChange={(v) => set({ [field.name]: v })} />
          case 'variable':
            return <Input key={field.name} label={ui(field)} optional={field.optional} hint={t('ch.step.variableHint')} value={value ?? ''} onChange={(e) => set({ [field.name]: e.target.value.replace(/[^a-zA-Z0-9_]/g, '_') })} />
          case 'variable_ref':
            return <Select key={field.name} label={ui(field)} options={[...(field.optional ? [{ value: '', label: t('ch.step.none') }] : []), ...variables.map((v) => ({ value: v, label: v }))]} value={value ?? ''} onChange={(v) => set({ [field.name]: v })} />
          case 'mapping':
            return <MappingRows key={field.name} field={field} value={value} variables={variables} ui={ui} onChange={(v) => set({ [field.name]: v })} />
          case 'program':
            if (programs.isPending && programs.fetchStatus === 'idle') return <p key={field.name} className="text-d-cap text-muted">{t('ch.step.programHidden')}</p>
            return <Select key={field.name} label={ui(field)} options={[{ value: '', label: t('ch.step.generalIdeas') }, ...programList.map((p) => ({ value: p.id, label: p.title }))]} value={value ?? ''} onChange={(v) => set({ [field.name]: v || null })} />
          case 'number':
            return <Input key={field.name} type="number" label={ui(field)} optional={field.optional} value={value ?? ''} onChange={(e) => set({ [field.name]: e.target.value === '' ? null : Number(e.target.value) })} />
          default:
            return <Input key={field.name} label={ui(field)} optional={field.optional} value={value ?? ''} onChange={(e) => set({ [field.name]: e.target.value })} />
        }
      })}

      {nextPort && <TargetSelect label={t('ch.step.thenGoTo')} value={node.next} nodes={nodes} selfKey={node.key} onChange={(v) => onChange(connect(node, 'next', v))} />}

      <Input label={t('ch.step.title')} hint={t('ch.step.titleHint')} value={node.title ?? ''} maxLength={80} onChange={(e) => onChange({ ...node, title: e.target.value })} />

      <div className="flex flex-wrap gap-2 pt-2 border-t border-border">
        <Button variant="secondary" size="sm" icon={<Flag size={14} />} disabled={isStart} onClick={onSetStart}>{isStart ? t('ch.step.isStart') : t('ch.step.makeStart')}</Button>
        <Button variant="ghost" size="sm" icon={<Trash2 size={14} />} className="ml-auto text-danger" onClick={onDelete}>{t('ch.step.delete')}</Button>
      </div>
    </aside>
  )
}
