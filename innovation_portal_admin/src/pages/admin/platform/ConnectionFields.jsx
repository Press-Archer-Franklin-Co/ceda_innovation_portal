import React, { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'

/**
 * Renders a provider's field schema (from GET /api/platform/providers/).
 *
 * config:        current non-secret values
 * secretState:   {name: {is_set, last4}} from the server
 * secretEdits:   {name: string | null} only for secrets being replaced (null = clear)
 */
export default function ConnectionFields({ fields, config, onConfigChange, secretState, secretEdits, onSecretChange }) {
  const roleChoices = fields.find((f) => f.name === 'default_role')?.choices ?? []
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {fields.map((field) => {
        const wide = ['textarea', 'list', 'mapping', 'json'].includes(field.type) || field.secret
        return (
          <div key={field.name} className={wide ? 'sm:col-span-2' : ''}>
            {field.secret ? (
              <SecretField
                field={field}
                saved={secretState?.[field.name]}
                edit={secretEdits[field.name]}
                onChange={(value) => onSecretChange(field.name, value)}
              />
            ) : (
              <PlainField
                field={field}
                value={config[field.name]}
                roleChoices={roleChoices}
                onChange={(value) => onConfigChange(field.name, value)}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}

function FieldLabel({ field, htmlFor }) {
  return (
    <label className="label" htmlFor={htmlFor}>
      {field.label}
      {field.required && <span className="text-ceda-red"> *</span>}
    </label>
  )
}

function Help({ field }) {
  return field.help_text ? <p className="text-xs text-ceda-muted mt-1">{field.help_text}</p> : null
}

function PlainField({ field, value, onChange, roleChoices }) {
  const id = `field-${field.name}`
  if (field.type === 'boolean') {
    return (
      <label className="flex items-center gap-2 text-sm text-ceda-dark">
        <input id={id} type="checkbox" className="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} />
        {field.label}
        <Help field={field} />
      </label>
    )
  }
  if (field.type === 'select') {
    return (
      <>
        <FieldLabel field={field} htmlFor={id} />
        <select id={id} className="select" value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
          {!field.required && <option value="">Not set</option>}
          {field.choices.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
        <Help field={field} />
      </>
    )
  }
  if (field.type === 'list') {
    return (
      <>
        <FieldLabel field={field} htmlFor={id} />
        <textarea
          id={id}
          className="textarea min-h-[80px]"
          value={(value ?? []).join('\n')}
          placeholder={field.placeholder || 'One per line'}
          onChange={(e) => onChange(e.target.value.split('\n'))}
          onBlur={(e) => onChange(e.target.value.split('\n').map((s) => s.trim()).filter(Boolean))}
        />
        <Help field={field} />
      </>
    )
  }
  if (field.type === 'mapping') {
    return <MappingField field={field} value={value ?? {}} onChange={onChange} valueChoices={field.name === 'group_role_map' ? roleChoices : []} />
  }
  if (field.type === 'textarea') {
    return (
      <>
        <FieldLabel field={field} htmlFor={id} />
        <textarea id={id} className="textarea font-mono text-xs" value={value ?? ''} placeholder={field.placeholder} onChange={(e) => onChange(e.target.value)} />
        <Help field={field} />
      </>
    )
  }
  return (
    <>
      <FieldLabel field={field} htmlFor={id} />
      <input
        id={id}
        className="input"
        type={field.type === 'number' ? 'number' : field.type === 'url' ? 'url' : 'text'}
        value={value ?? ''}
        placeholder={field.placeholder}
        onChange={(e) => onChange(field.type === 'number' && e.target.value !== '' ? Number(e.target.value) : e.target.value)}
      />
      <Help field={field} />
    </>
  )
}

function MappingField({ field, value, onChange, valueChoices }) {
  const rows = Object.entries(value)
  const [draftKey, setDraftKey] = useState('')
  const [draftValue, setDraftValue] = useState(valueChoices[0]?.value ?? '')

  const update = (entries) => onChange(Object.fromEntries(entries))
  const add = () => {
    if (!draftKey.trim() || !draftValue) return
    update([...rows.filter(([k]) => k !== draftKey.trim()), [draftKey.trim(), draftValue]])
    setDraftKey('')
  }

  return (
    <div>
      <FieldLabel field={field} />
      <div className="space-y-2">
        {rows.map(([k, v]) => (
          <div key={k} className="flex items-center gap-2">
            <span className="input flex-1 truncate bg-ceda-surface">{k}</span>
            <span className="input flex-1 truncate bg-ceda-surface">{valueChoices.find((c) => c.value === v)?.label ?? v}</span>
            <button type="button" className="btn-icon" aria-label={`Remove ${k}`} onClick={() => update(rows.filter(([key]) => key !== k))}>
              <Trash2 size={14} />
            </button>
          </div>
        ))}
        <div className="flex flex-col sm:flex-row gap-2">
          <input className="input flex-1" placeholder="Group ID or name" value={draftKey} onChange={(e) => setDraftKey(e.target.value)} />
          {valueChoices.length ? (
            <select className="select flex-1" value={draftValue} onChange={(e) => setDraftValue(e.target.value)}>
              {valueChoices.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          ) : (
            <input className="input flex-1" placeholder="Value" value={draftValue} onChange={(e) => setDraftValue(e.target.value)} />
          )}
          <button type="button" className="btn-secondary btn-sm flex-shrink-0" onClick={add}>
            <Plus size={14} /> Add
          </button>
        </div>
      </div>
      <Help field={field} />
    </div>
  )
}

function SecretField({ field, saved, edit, onChange }) {
  const id = `secret-${field.name}`
  const replacing = edit !== undefined
  const isJson = field.type === 'json'

  if (!replacing && saved?.is_set) {
    return (
      <div>
        <FieldLabel field={field} />
        <div className="flex flex-wrap items-center gap-2">
          <span className="input flex-1 bg-ceda-surface text-ceda-muted">
            {saved.last4 ? `Saved, ending ${saved.last4}` : 'Saved'}
          </span>
          <button type="button" className="btn-secondary btn-sm" onClick={() => onChange('')}>Replace</button>
          {!field.required && (
            <button type="button" className="btn-ghost btn-sm" onClick={() => onChange(null)}>Clear</button>
          )}
        </div>
        <Help field={field} />
      </div>
    )
  }

  if (edit === null) {
    return (
      <div>
        <FieldLabel field={field} />
        <div className="flex items-center gap-2">
          <span className="input flex-1 bg-ceda-surface text-ceda-muted">Will be cleared when you save</span>
          <button type="button" className="btn-ghost btn-sm" onClick={() => onChange(undefined)}>Undo</button>
        </div>
      </div>
    )
  }

  return (
    <div>
      <FieldLabel field={field} htmlFor={id} />
      {isJson ? (
        <textarea
          id={id}
          className="textarea font-mono text-xs"
          placeholder='{"Authorization": "Bearer ..."}'
          value={edit ?? ''}
          onChange={(e) => onChange(e.target.value)}
          autoComplete="off"
          spellCheck={false}
        />
      ) : (
        <input
          id={id}
          className="input"
          type="password"
          autoComplete="new-password"
          value={edit ?? ''}
          placeholder={saved?.is_set ? 'Enter the new value' : field.placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
      {saved?.is_set && (
        <button type="button" className="text-xs text-ceda-muted underline mt-1" onClick={() => onChange(undefined)}>
          Keep the saved value
        </button>
      )}
      <Help field={field} />
    </div>
  )
}
