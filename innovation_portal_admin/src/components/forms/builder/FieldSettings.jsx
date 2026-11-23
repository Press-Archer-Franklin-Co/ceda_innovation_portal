import { useState } from 'react'
import { Copy, Filter, Plus, Trash2, X } from 'lucide-react'
import Button from '../../ui/Button'
import Input, { InputControl } from '../../ui/Input'
import { SelectControl } from '../../ui/Select'
import { Toggle } from '../../ui/Choice'
import Tabs from '../../ui/Tabs'
import { useEditorPanel } from '../../ui/editorPanel'
import { useT } from '../../../i18n/context'
import { cn } from '../../../lib/cn'
import { pick } from '../../../lib/forms/format'
import {
  CHOICE_TYPES, LAYOUT_TYPES, PALETTE, PROFILE_FIELDS, PROFILE_NONE, PROFILE_TYPE_DEFAULTS, WIDTHS, allFields, allowedWidths, slugKey,
} from '../../../lib/forms/document'

// Answers a profile value can never stand for.
const NO_PROFILE_TYPES = new Set(['file', 'media', 'boolean', 'yes_no', 'multiselect', 'checkboxes'])
const OPS = ['equals', 'not_equals', 'in', 'is_empty', 'is_not_empty']
const NO_VALUE = new Set(['is_empty', 'is_not_empty'])
const TEXT_RULES = [
  { type: 'min_length', label: 'settings.minLength' },
  { type: 'max_length', label: 'settings.maxLength' },
]
const NUMBER_RULES = [
  { type: 'min_value', label: 'settings.minValue' },
  { type: 'max_value', label: 'settings.maxValue' },
]

/**
 * 3.5 right panel for the selected field. Every change goes through `onChange(patch)`,
 * so it lands in the builder's undo history and autosave.
 */
export default function FieldSettings({ doc, field, onChange, onClose, onDuplicate, onDelete, onSuggest, suggestion }) {
  const t = useT()
  const [tab, setTab] = useState('field')
  const { inSheet } = useEditorPanel()
  if (!field) return null
  const text = (attr, lang) => field[attr]?.[lang] ?? ''
  const setText = (attr, lang, value) => onChange({ [attr]: { ...(field[attr] ?? { en: '', tn: '' }), [lang]: value } })
  const layout = LAYOUT_TYPES.has(field.type)
  const widths = allowedWidths(doc, field.key)
  const withTn = (doc.languages ?? []).includes('tn')

  return (
    <div className={cn('flex flex-col gap-4', !inSheet && 'rounded-card border border-border bg-surface p-[14px] 2xl:p-[18px]')}>
      <div className={cn('flex items-center justify-between gap-2', inSheet && 'hidden')}>
        <h2 className="text-[15px] font-bold text-text">{t('settings.title')}</h2>
        <button type="button" onClick={onClose} aria-label={t('settings.close')} className="flex h-8 w-8 items-center justify-center rounded-control text-muted hover:bg-surface2 hover:text-text">
          <X size={16} aria-hidden />
        </button>
      </div>
      <Tabs
        tabs={[{ key: 'field', label: t('settings.tabField') }, ...(layout ? [] : [{ key: 'rules', label: t('settings.tabRules') }])]}
        active={tab}
        onChange={setTab}
        variant="segment"
        label={t('settings.title')}
        idPrefix="field-settings"
      />

      {tab === 'field' && (
        <>
          <Labelled label={t('settings.type')}>
            <SelectControl
              aria-label={t('settings.type')}
              value={field.type}
              onChange={(type) => onChange({ type, options: CHOICE_TYPES.has(type) && field.options.length === 0 ? defaultOptions() : field.options })}
              options={PALETTE.flatMap((g) => g.types).map((type) => ({ value: type, label: t(`builder.type.${type}`) }))}
            />
          </Labelled>

          <Bilingual
            label={t('settings.question')}
            en={text('label', 'en')}
            tn={text('label', 'tn')}
            withTn={withTn}
            onEn={(v) => setText('label', 'en', v)}
            onTn={(v) => setText('label', 'tn', v)}
            suggestion={suggestion}
            onSuggest={onSuggest}
          />

          {!layout && (
            <>
              <Bilingual label={t('settings.help')} en={text('help_text', 'en')} tn={text('help_text', 'tn')} withTn={withTn} onEn={(v) => setText('help_text', 'en', v)} onTn={(v) => setText('help_text', 'tn', v)} />
              {!CHOICE_TYPES.has(field.type) && field.type !== 'yes_no' && (
                <Bilingual label={t('settings.placeholder')} en={text('placeholder', 'en')} tn={text('placeholder', 'tn')} withTn={withTn} onEn={(v) => setText('placeholder', 'en', v)} onTn={(v) => setText('placeholder', 'tn', v)} />
              )}
            </>
          )}

          <Labelled label={t('settings.width')}>
            <div role="radiogroup" aria-label={t('settings.width')} className="grid grid-cols-4 gap-1 rounded-control bg-surface2 p-1">
              {WIDTHS.map((w) => {
                const allowed = widths.includes(w)
                return (
                  <button
                    key={w}
                    type="button"
                    role="radio"
                    aria-checked={field.width === w}
                    aria-label={t(`settings.widthLabel.${w}`)}
                    title={allowed ? undefined : t('settings.widthNoRoom')}
                    disabled={!allowed}
                    onClick={() => onChange({ width: w })}
                    className={cn(
                      'h-8 rounded text-[13px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:text-muted/50',
                      field.width === w ? 'bg-surface font-bold text-text shadow-sm' : 'text-muted hover:text-text',
                    )}
                  >
                    {t(w === 'quarter' ? 'settings.widthQuarter' : w === 'half' ? 'settings.widthHalf' : w === 'three_quarter' ? 'settings.widthThree' : 'settings.widthFull')}
                  </button>
                )
              })}
            </div>
          </Labelled>

          {!layout && (
            <>
              <Toggle label={t('settings.required')} checked={Boolean(field.required)} onChange={(checked) => onChange({ required: checked })} />
              <Toggle
                label={t('settings.challengeQuestion')}
                description={t('settings.challengeQuestionHint')}
                checked={Boolean(field.is_challenge_question)}
                onChange={(checked) => onChange({ is_challenge_question: checked })}
              />
              {!NO_PROFILE_TYPES.has(field.type) && (
                <Labelled label={t('settings.profileField')}>
                  <SelectControl
                    aria-label={t('settings.profileField')}
                    value={field.profile_field || ''}
                    onChange={(value) => onChange({ profile_field: value })}
                    options={[
                      {
                        value: '',
                        label: PROFILE_TYPE_DEFAULTS[field.type]
                          ? t('settings.profileAuto', { name: t(`settings.profile.${PROFILE_TYPE_DEFAULTS[field.type]}`) })
                          : t('settings.profileOff'),
                      },
                      ...PROFILE_FIELDS.map((name) => ({ value: name, label: t(`settings.profile.${name}`) })),
                      ...(PROFILE_TYPE_DEFAULTS[field.type] ? [{ value: PROFILE_NONE, label: t('settings.profileNever') }] : []),
                    ]}
                  />
                  <span className="text-[12px] text-muted">{t('settings.profileHint')}</span>
                </Labelled>
              )}
            </>
          )}

          {CHOICE_TYPES.has(field.type) && <OptionsEditor field={field} withTn={withTn} onChange={onChange} />}

          {!layout && (
            <Input
              label={t('settings.key')}
              hint={t('settings.keyHint')}
              value={field.key}
              onChange={(e) => {
                const next = slugKey(e.target.value)
                if (next && !allFields(doc).some((f) => f.key === next && f.key !== field.key)) onChange({ key: next })
              }}
            />
          )}
        </>
      )}

      {tab === 'rules' && !layout && (
        <>
          <ConditionEditor doc={doc} field={field} onChange={onChange} />
          <RulesEditor field={field} onChange={onChange} />
        </>
      )}

      <div className="flex gap-2 border-t border-border pt-3">
        <Button variant="ghost" size="sm" onClick={onDuplicate}>
          <Copy size={14} aria-hidden /> {t('settings.duplicate')}
        </Button>
        <Button variant="danger" size="sm" onClick={onDelete}>
          <Trash2 size={14} aria-hidden /> {t('settings.delete')}
        </Button>
      </div>
    </div>
  )
}

function defaultOptions() {
  return [
    { value: 'option_1', label: { en: 'Option 1', tn: '' }, description: { en: '', tn: '' } },
    { value: 'option_2', label: { en: 'Option 2', tn: '' }, description: { en: '', tn: '' } },
  ]
}

function Labelled({ label, children }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[12px] font-bold text-muted">{label}</span>
      {children}
    </div>
  )
}

function Bilingual({ label, en, tn, withTn, onEn, onTn, suggestion, onSuggest }) {
  const t = useT()
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="mb-1.5 text-[12px] font-bold text-muted">{label}</legend>
      <InputControl aria-label={`${label} (${t('lang.en')})`} value={en} onChange={(e) => onEn(e.target.value)} leading={<span className="text-[11px] font-bold">EN</span>} />
      {withTn && (
        <>
          <InputControl
            aria-label={`${label} (${t('lang.tn')})`}
            value={tn}
            placeholder={suggestion || undefined}
            onChange={(e) => onTn(e.target.value)}
            leading={<span className="text-[11px] font-bold">TN</span>}
          />
          {onSuggest && !tn && (
            suggestion ? (
              <button type="button" onClick={() => onTn(suggestion)} className="self-start text-[12px] text-primary hover:underline">
                {t('tr.useSuggestion')} ({t('settings.suggested')})
              </button>
            ) : (
              <button type="button" onClick={onSuggest} className="self-start text-[12px] text-primary hover:underline">
                {t('settings.suggest')}
              </button>
            )
          )}
        </>
      )}
    </fieldset>
  )
}

function OptionsEditor({ field, withTn, onChange }) {
  const t = useT()
  const options = field.options ?? []
  const set = (i, patch) => onChange({ options: options.map((o, j) => (j === i ? { ...o, ...patch } : o)) })
  function add() {
    const taken = new Set(options.map((o) => o.value))
    let n = options.length + 1
    while (taken.has(`option_${n}`)) n += 1
    onChange({ options: [...options, { value: `option_${n}`, label: { en: `Option ${n}`, tn: '' }, description: { en: '', tn: '' } }] })
  }
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1.5 text-[12px] font-bold text-muted">{t('settings.options')}</legend>
      {options.map((option, i) => (
        <div key={i} className="flex flex-col gap-1 rounded-control border border-border p-2">
          <div className="flex items-center gap-1">
            <InputControl
              aria-label={t('settings.option', { n: i + 1 })}
              value={option.label?.en ?? ''}
              onChange={(e) => set(i, { label: { ...option.label, en: e.target.value } })}
            />
            <button
              type="button"
              onClick={() => onChange({ options: options.filter((_, j) => j !== i) })}
              aria-label={t('settings.removeOption', { n: i + 1 })}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-control text-muted hover:text-danger"
            >
              <X size={14} aria-hidden />
            </button>
          </div>
          {withTn && (
            <InputControl
              aria-label={`${t('settings.option', { n: i + 1 })} (${t('lang.tn')})`}
              value={option.label?.tn ?? ''}
              onChange={(e) => set(i, { label: { ...option.label, tn: e.target.value } })}
              leading={<span className="text-[11px] font-bold">TN</span>}
            />
          )}
          {field.type === 'radio' && (
            <InputControl
              aria-label={t('settings.optionDescription')}
              placeholder={t('settings.optionDescription')}
              value={option.description?.en ?? ''}
              onChange={(e) => set(i, { description: { ...(option.description ?? { en: '', tn: '' }), en: e.target.value } })}
            />
          )}
        </div>
      ))}
      <Button variant="ghost" size="sm" onClick={add} className="self-start">
        <Plus size={14} aria-hidden /> {t('settings.addOption')}
      </Button>
    </fieldset>
  )
}

function ConditionEditor({ doc, field, onChange }) {
  const t = useT()
  const clauses = field.visible_if?.all ?? []
  const others = allFields(doc).filter((f) => f.key !== field.key && !LAYOUT_TYPES.has(f.type))
  const set = (next) => onChange({ visible_if: next.length ? { all: next } : {} })
  const update = (i, patch) => set(clauses.map((c, j) => (j === i ? { ...c, ...patch } : c)))
  function add() {
    const first = others[0]
    if (!first) return
    set([...clauses, { field: first.key, op: 'equals', value: first.options?.[0]?.value ?? (first.type === 'yes_no' ? 'yes' : '') }])
  }
  return (
    <fieldset className="flex flex-col gap-2 rounded-control bg-surface2 p-3">
      <legend className="sr-only">{t('settings.condition')}</legend>
      <p className="flex items-center gap-1.5 text-[12px] font-bold text-text">
        <Filter size={14} aria-hidden /> {t('settings.condition')}
      </p>
      {clauses.length === 0 && <p className="text-[12px] text-muted">{t('settings.conditionNone')}</p>}
      {clauses.map((clause, i) => {
        const target = others.find((f) => f.key === clause.field)
        const choices = target?.type === 'yes_no'
          ? [{ value: 'yes', label: t('settings.yes') }, { value: 'no', label: t('settings.no') }]
          : (target?.options ?? []).map((o) => ({ value: o.value, label: pick(o.label, 'en') }))
        return (
          <div key={i} className="flex flex-col gap-1.5 rounded-control bg-surface p-2">
            <SelectControl
              aria-label={t('settings.conditionField')}
              value={clause.field}
              onChange={(key) => update(i, { field: key, value: '' })}
              options={others.map((f) => ({ value: f.key, label: pick(f.label, 'en') || f.key }))}
            />
            <div className="flex gap-1.5">
              <SelectControl
                aria-label={t('settings.conditionOp')}
                value={clause.op}
                onChange={(op) => update(i, { op, ...(NO_VALUE.has(op) ? { value: undefined } : {}) })}
                options={OPS.map((op) => ({ value: op, label: t(`settings.op.${op}`) }))}
              />
              <button type="button" onClick={() => set(clauses.filter((_, j) => j !== i))} aria-label={t('settings.removeCondition')} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-control text-muted hover:text-danger">
                <X size={14} aria-hidden />
              </button>
            </div>
            {!NO_VALUE.has(clause.op) && (
              choices.length > 0 && clause.op !== 'in' ? (
                <SelectControl aria-label={t('settings.conditionValue')} value={clause.value ?? ''} onChange={(value) => update(i, { value })} options={choices} />
              ) : (
                <InputControl
                  aria-label={t('settings.conditionValue')}
                  value={Array.isArray(clause.value) ? clause.value.join(', ') : clause.value ?? ''}
                  onChange={(e) => update(i, { value: clause.op === 'in' ? e.target.value.split(',').map((v) => v.trim()).filter(Boolean) : e.target.value })}
                />
              )
            )}
          </div>
        )
      })}
      {others.length > 0 && (
        <button type="button" onClick={add} className="flex items-center gap-1 self-start text-[12px] text-primary hover:underline">
          <Plus size={12} aria-hidden /> {clauses.length ? t('settings.addAnother') : t('settings.addCondition')}
        </button>
      )}
    </fieldset>
  )
}

function RulesEditor({ field, onChange }) {
  const t = useT()
  const kinds = field.type === 'number' ? NUMBER_RULES : ['text', 'textarea', 'omang_id', 'phone', 'email', 'url'].includes(field.type) ? TEXT_RULES : []
  const value = (type) => field.rules?.find((r) => r.rule_type === type)?.rule_value ?? ''
  function setRule(type, raw) {
    const rest = (field.rules ?? []).filter((r) => r.rule_type !== type)
    const clean = raw.replace(/[^\d.]/g, '')
    onChange({ rules: clean ? [...rest, { rule_type: type, rule_value: clean, error_message: '' }] : rest })
  }
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1.5 text-[12px] font-bold text-muted">{t('settings.check')}</legend>
      {kinds.length === 0 ? (
        <p className="text-[12px] text-muted">{t('settings.checkNone')}</p>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {kinds.map((kind) => (
            <Input key={kind.type} label={t(kind.label)} inputMode="numeric" value={value(kind.type)} onChange={(e) => setRule(kind.type, e.target.value)} />
          ))}
        </div>
      )}
    </fieldset>
  )
}
