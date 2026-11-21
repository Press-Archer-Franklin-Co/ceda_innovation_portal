import { useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, Highlighter, Plus, Trash2, X } from 'lucide-react'
import Input from '../../ui/Input'
import Textarea from '../../ui/Textarea'
import Select from '../../ui/Select'
import Button from '../../ui/Button'
import { Toggle } from '../../ui/Choice'
import { useT } from '../../../i18n/context'
import { client } from '../../../lib/api/client'
import { addHighlight, highlightList, missingSetswana, removeHighlight } from '../../../lib/content/home'
import { useSectionName } from './useSectionName'
import HeroPhotoField from './HeroPhotoField'

const list = (data) => (Array.isArray(data) ? data : data?.results ?? [])
// Settings written as a sentence or two get a text box; headings and labels stay one line.
const MULTILINE = new Set(['text'])

function useFieldLabel() {
  const t = useT()
  return (name) => {
    const key = `home.field.${name}`
    const text = t(key)
    return text === key ? name.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase()) : text
  }
}

/** One bilingual text in the chosen language; in Setswana the English is shown underneath. */
function TextField({ label, spec, value, lang, onChange, error, multiline, inputRef, onSelect }) {
  const t = useT()
  const text = value?.[lang] ?? ''
  const english = value?.en ?? ''
  const hint = lang === 'tn' && english ? t('home.englishWas', { text: english }) : undefined
  const set = (v) => onChange({ en: value?.en ?? '', tn: value?.tn ?? '', [lang]: v })
  const required = spec.required && lang === 'en'
  if (multiline) {
    return <Textarea label={label} value={text} onChange={(e) => set(e.target.value)} maxChars={spec.max || undefined} rows={3} hint={hint} error={error} required={required} />
  }
  return <Input ref={inputRef} label={label} value={text} onChange={(e) => set(e.target.value)} onSelect={onSelect} maxLength={spec.max || undefined} hint={hint} error={error} required={required} />
}

/** Headline with "select words and press Highlight" (Figma 3.8 callout 3). */
function HeadlineField({ label, spec, value, lang, words, onChange, onWords, error }) {
  const t = useT()
  const input = useRef(null)
  const selection = useRef('')
  const [note, setNote] = useState('')
  const remember = (e) => {
    const el = e.target
    selection.current = el.value.slice(el.selectionStart ?? 0, el.selectionEnd ?? 0)
  }
  const highlight = () => {
    const el = input.current
    const picked = el ? el.value.slice(el.selectionStart ?? 0, el.selectionEnd ?? 0) : ''
    const phrase = (picked || selection.current).trim()
    if (!phrase) {
      setNote(t('home.highlightNone'))
      return
    }
    setNote('')
    onWords(addHighlight(words, phrase))
    selection.current = ''
  }
  const chips = highlightList(words)
  return (
    <div className="flex flex-col gap-2">
      <TextField label={label} spec={spec} value={value} lang={lang} onChange={onChange} error={error} inputRef={input} onSelect={remember} />
      <div className="flex flex-wrap items-center gap-2">
        {/* onMouseDown keeps the text selected in the headline while the button is pressed. */}
        <Button variant="soft" size="sm" icon={<Highlighter size={14} aria-hidden className="text-amber" />} onMouseDown={(e) => e.preventDefault()} onClick={highlight}>
          {t('home.highlight')}
        </Button>
        {chips.length > 0 && <span className="text-[12px] text-muted">{t('home.highlighted')}:</span>}
        {chips.map((word) => (
          <span key={word} className="inline-flex items-center gap-1 rounded-full bg-amber/20 py-0.5 pl-2.5 pr-1 text-[12px] font-semibold text-text">
            {word}
            <button type="button" onClick={() => onWords(removeHighlight(words, word))} aria-label={t('home.unhighlight', { word })}
              className="flex h-5 w-5 items-center justify-center rounded-full hover:bg-amber/30">
              <X size={12} aria-hidden />
            </button>
          </span>
        ))}
      </div>
      <p className={note ? 'text-d-cap text-danger' : 'text-d-cap text-muted'} role={note ? 'alert' : undefined}>{note || t('home.highlightHint')}</p>
    </div>
  )
}

function ButtonField({ label, value, lang, onChange, errorFor }) {
  const t = useT()
  const v = value ?? { label: { en: '', tn: '' }, url: '' }
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-[13px] font-bold text-text">{label}</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        <TextField label={t('home.buttonLabel')} spec={{ max: 40 }} value={v.label} lang={lang} onChange={(l) => onChange({ ...v, label: l })} error={errorFor('label')} />
        <Input label={t('home.buttonLink')} value={v.url ?? ''} placeholder="/challenges" onChange={(e) => onChange({ ...v, url: e.target.value })} error={errorFor('url')} />
      </div>
    </fieldset>
  )
}

function SectorPicker({ label, value, onChange, error }) {
  const t = useT()
  const sectors = useQuery({ queryKey: ['reference', 'sectors'], queryFn: () => client.get('/api/reference/sectors/'), staleTime: 10 * 60 * 1000 })
  const options = list(sectors.data).map((s) => ({ value: String(s.id), label: s.name, keywords: s.slug }))
  // The API takes a sector id or slug; show the slug's sector when one was saved that way.
  const match = options.find((o) => o.value === value || o.keywords === value)
  return <Select label={label ?? t('home.field.sector')} options={options} value={match?.value ?? null} onChange={(v) => onChange(v ?? '')} error={error} required />
}

function ListField({ name, spec, value, lang, onChange, errors }) {
  const t = useT()
  const label = useFieldLabel()
  const items = Array.isArray(value) ? value : []
  const blank = () => Object.fromEntries(Object.entries(spec.item).map(([k, s]) => [k, s.kind === 'text' ? { en: '', tn: '' } : s.kind === 'bool' ? false : '']))
  const setItem = (i, key, v) => onChange(items.map((item, j) => (j === i ? { ...item, [key]: v } : item)))
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-1 text-[13px] font-bold text-text">{label(name)}</legend>
      {items.map((item, i) => (
        <div key={i} className="flex flex-col gap-2 rounded-card border border-border bg-surface2/60 p-3">
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-bold text-muted">{t('home.item', { n: i + 1 })}</span>
            <button type="button" onClick={() => onChange(items.filter((_, j) => j !== i))} aria-label={t('home.removeItem', { n: i + 1 })}
              className="flex h-7 w-7 items-center justify-center rounded text-muted hover:text-danger">
              <Trash2 size={14} aria-hidden />
            </button>
          </div>
          {Object.entries(spec.item).map(([key, sub]) => {
            const error = errors.find((e) => e.path?.startsWith(`${name}[${i}].${key}`))?.message
            if (key === 'sector') return <SectorPicker key={key} label={label(key)} value={item?.[key] ?? ''} onChange={(v) => setItem(i, key, v)} error={error} />
            if (sub.kind === 'text') return <TextField key={key} label={label(key)} spec={sub} value={item?.[key]} lang={lang} onChange={(v) => setItem(i, key, v)} error={error} />
            return <Input key={key} label={label(key)} value={item?.[key] ?? ''} onChange={(e) => setItem(i, key, e.target.value)} maxLength={sub.max} error={error} optional={!sub.required} />
          })}
        </div>
      ))}
      {(!spec.max || items.length < spec.max) && (
        <button type="button" onClick={() => onChange([...items, blank()])} className="inline-flex items-center gap-1 self-start text-[13px] text-primary hover:underline">
          <Plus size={13} aria-hidden /> {t('home.addItem')}
        </button>
      )}
    </fieldset>
  )
}

/**
 * 3.8 middle column: the selected section's settings, made from its type's settings schema
 * (B6 GET /api/content/section-types/). Texts are edited in the chosen language.
 * `errors` are this section's API errors as [{name, path, message}].
 */
export default function SectionSettings({ section, types, lang, onChange, errors = [], onRemove, removable }) {
  const t = useT()
  const label = useFieldLabel()
  const sectionName = useSectionName()(types, section.type)
  const spec = types.find((x) => x.type === section.type)
  const schema = spec?.settings_schema ?? {}
  const settings = section.settings ?? {}
  const missing = missingSetswana(settings, schema)
  const errorOf = (name) => errors.find((e) => e.name === name)?.message
  const nested = (name) => errors.filter((e) => e.name === name).map((e) => ({ ...e, path: e.path?.replace(/^sections\[\d+\]\.settings\./, '') }))

  const fields = Object.entries(schema).filter(([name]) => !(section.type === 'hero_banner' && name === 'highlighted_words'))
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <h2 className="font-heading text-[17px] font-bold text-text">{sectionName}</h2>
        {removable && (
          <Button variant="ghost" size="sm" icon={<Trash2 size={14} aria-hidden />} onClick={onRemove}>{t('home.remove')}</Button>
        )}
      </div>
      {missing.length > 0 && (
        <p className="flex items-start gap-2 rounded-control bg-warning-soft px-3 py-2 text-[12px] text-text">
          <AlertTriangle size={14} aria-hidden className="mt-0.5 shrink-0 text-warning" />
          <span><b>{t('home.missingTn')}:</b> {missing.map(label).join(', ')}. {t('home.missingTnBody')}</span>
        </p>
      )}
      {errors.filter((e) => !e.name).map((e, i) => <p key={i} role="alert" className="rounded-control bg-danger-soft px-3 py-2 text-[12px] text-danger">{e.message}</p>)}
      {fields.length === 0 && <p className="text-[13px] text-muted">{t('home.noSettings')}</p>}
      {fields.map(([name, field]) => {
        const value = settings[name]
        const set = (v) => onChange(name, v)
        if (section.type === 'hero_banner' && name === 'headline') {
          return <HeadlineField key={name} label={label(name)} spec={field} value={value} lang={lang} words={settings.highlighted_words ?? ''} onChange={set} onWords={(w) => onChange('highlighted_words', w)} error={errorOf(name) ?? errorOf('highlighted_words')} />
        }
        if (field.kind === 'text') return <TextField key={name} label={label(name)} spec={field} value={value} lang={lang} onChange={set} error={errorOf(name)} multiline={MULTILINE.has(name)} />
        if (field.kind === 'bool') return <Toggle key={name} label={label(name)} checked={!!value} onChange={set} />
        if (field.kind === 'int') {
          return (
            <Input key={name} type="number" inputMode="numeric" label={label(name)} min={field.min} max={field.max} value={value ?? ''} error={errorOf(name)}
              hint={field.min != null && field.max != null ? `${field.min} to ${field.max}` : undefined}
              onChange={(e) => set(e.target.value === '' ? field.default ?? field.min ?? 0 : Number.parseInt(e.target.value, 10))} />
          )
        }
        if (field.kind === 'button') return <ButtonField key={name} label={label(name)} value={value} lang={lang} onChange={set} errorFor={(part) => errors.find((e) => e.name === name && e.path?.includes(`.${part}`))?.message} />
        if (field.kind === 'list') return <ListField key={name} name={name} spec={field} value={value} lang={lang} onChange={set} errors={nested(name)} />
        if (field.kind === 'photo') return <HeroPhotoField key={name} label={label(name)} value={value} lang={lang} onChange={set} errors={nested(name)} />
        return <Input key={name} label={label(name)} value={value ?? ''} maxLength={field.max} onChange={(e) => set(e.target.value)} error={errorOf(name)} />
      })}
    </div>
  )
}
