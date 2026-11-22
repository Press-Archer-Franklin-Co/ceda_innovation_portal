import { useState } from 'react'
import { Plus, X } from 'lucide-react'
import Input from '../ui/Input'
import Textarea from '../ui/Textarea'
import Select from '../ui/Select'
import Button from '../ui/Button'
import Field from '../ui/Field'
import { Toggle } from '../ui/Choice'
import { useI18n } from '../../i18n/context'

// A provider's settings form, from the field list in GET /api/channels/providers/ (label, type, secret,
// required, choices, help text). Secrets are never sent to the browser: a saved one shows as "Saved" and
// an empty box keeps it. Labels and help come from the provider in English.

function SecretField({ field, saved, edit, onChange }) {
  const { t } = useI18n()
  const isSet = saved?.is_set && edit === undefined
  return (
    <div>
      <Input
        type="password"
        autoComplete="new-password"
        label={field.label}
        required={field.required && !saved?.is_set}
        hint={edit === null ? t('ch.keys.willClear') : isSet ? t('ch.keys.saved', { last4: saved.last4 ? `…${saved.last4}` : '' }) : field.help_text || t('ch.keys.secretHint')}
        value={edit ?? ''}
        placeholder={isSet ? t('ch.keys.keepSaved') : ''}
        onChange={(e) => onChange(e.target.value)}
      />
      {saved?.is_set && edit !== null && !field.required && (
        <Button variant="link" size="sm" onClick={() => onChange(null)}>{t('ch.keys.clear')}</Button>
      )}
    </div>
  )
}

function MappingField({ field, value, onChange, presetKeys }) {
  const { t } = useI18n()
  const rows = Object.entries(value ?? {})
  const keys = presetKeys?.length ? presetKeys.map((k) => k.key) : null
  if (keys) {
    return (
      <Field label={field.label} hint={field.help_text}>
        <div className="space-y-2">
          {presetKeys.map((item) => (
            <Input key={item.key} label={item.label} value={value?.[item.key] ?? ''} placeholder={t('ch.keys.notSet')} onChange={(e) => onChange({ ...(value ?? {}), [item.key]: e.target.value })} />
          ))}
        </div>
      </Field>
    )
  }
  return (
    <Field label={field.label} hint={field.help_text}>
      <ul className="space-y-2">
        {rows.map(([k, v], i) => (
          <li key={i} className="flex items-end gap-2">
            <Input label={t('ch.keys.name')} hideLabel={i > 0} fieldClassName="flex-1" value={k} onChange={(e) => onChange(Object.fromEntries(rows.map(([a, b], j) => (j === i ? [e.target.value, b] : [a, b]))))} />
            <Input label={t('ch.keys.value')} hideLabel={i > 0} fieldClassName="flex-1" value={v} onChange={(e) => onChange(Object.fromEntries(rows.map(([a, b], j) => [a, j === i ? e.target.value : b])))} />
            <button type="button" className="h-9 w-8 grid place-items-center rounded-control hover:bg-surface2" aria-label={t('ch.keys.removeRow')} onClick={() => onChange(Object.fromEntries(rows.filter((_, j) => j !== i)))}><X size={14} aria-hidden /></button>
          </li>
        ))}
      </ul>
      <Button className="mt-2" variant="secondary" size="sm" icon={<Plus size={14} />} disabled={'' in (value ?? {})} onClick={() => onChange({ ...(value ?? {}), '': '' })}>{t('ch.keys.addRow')}</Button>
    </Field>
  )
}

function JsonField({ field, value, onChange, onInvalid }) {
  const { t } = useI18n()
  const [text, setText] = useState(value ? JSON.stringify(value, null, 2) : '')
  const [error, setError] = useState('')
  return (
    <Textarea
      label={field.label}
      hint={field.help_text}
      rows={3}
      error={error || undefined}
      value={text}
      onChange={(e) => {
        setText(e.target.value)
        if (!e.target.value.trim()) { setError(''); onInvalid?.(field.name, false); return onChange(undefined) }
        try {
          const parsed = JSON.parse(e.target.value)
          setError('')
          onInvalid?.(field.name, false)
          onChange(parsed)
        } catch {
          setError(t('ch.keys.badJson'))
          onInvalid?.(field.name, true)
        }
      }}
    />
  )
}

export default function ProviderFields({ provider, config, onConfig, secretState, secretEdits, onSecret, onInvalid }) {
  const { t } = useI18n()
  const fields = provider?.fields ?? []
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {fields.map((field) => {
        const wide = ['textarea', 'list', 'mapping', 'json'].includes(field.type) || field.secret
        let control
        if (field.secret && field.type === 'json') {
          control = <JsonField field={field} value={undefined} onChange={(v) => onSecret(field.name, v)} onInvalid={onInvalid} />
        } else if (field.secret) {
          control = <SecretField field={field} saved={secretState?.[field.name]} edit={secretEdits[field.name]} onChange={(v) => onSecret(field.name, v)} />
        } else {
          const value = config[field.name]
          const set = (v) => onConfig(field.name, v)
          switch (field.type) {
            case 'boolean':
              control = <Toggle label={field.label} description={field.help_text} checked={!!value} onChange={set} />
              break
            case 'select':
              control = <Select label={field.label} hint={field.help_text} required={field.required} options={[...(field.required ? [] : [{ value: '', label: t('ch.keys.notSet') }]), ...field.choices]} value={value ?? ''} onChange={set} />
              break
            case 'textarea':
              control = <Textarea label={field.label} hint={field.help_text} required={field.required} rows={3} value={value ?? ''} onChange={(e) => set(e.target.value)} />
              break
            case 'list':
              control = <Textarea label={field.label} hint={field.help_text || t('ch.keys.onePerLine')} rows={3} value={(value ?? []).join('\n')} onChange={(e) => set(e.target.value.split('\n').map((s) => s.trim()).filter(Boolean))} />
              break
            case 'mapping':
              control = <MappingField field={field} value={value} onChange={set} presetKeys={field.name === 'templates' ? provider.template_types : null} />
              break
            case 'json':
              control = <JsonField field={field} value={value} onChange={set} onInvalid={onInvalid} />
              break
            case 'number':
              control = <Input type="number" label={field.label} hint={field.help_text} required={field.required} value={value ?? ''} onChange={(e) => set(e.target.value === '' ? null : Number(e.target.value))} />
              break
            default:
              control = <Input type={field.type === 'url' ? 'url' : 'text'} label={field.label} hint={field.help_text} required={field.required} placeholder={field.placeholder} value={value ?? ''} onChange={(e) => set(e.target.value)} />
          }
        }
        return <div key={field.name} className={wide ? 'sm:col-span-2' : ''}>{control}</div>
      })}
    </div>
  )
}
