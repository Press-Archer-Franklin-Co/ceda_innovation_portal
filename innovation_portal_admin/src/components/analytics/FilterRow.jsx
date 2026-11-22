import { useId, useMemo, useState } from 'react'
import { ChevronDown, SlidersHorizontal, X } from 'lucide-react'
import { SelectControl } from '../ui/Select'
import { InputControl } from '../ui/Input'
import Button from '../ui/Button'
import { useI18n, useT } from '../../i18n/context'
import { usePrograms } from '../../lib/queries/programs'
import { useReferenceList } from '../../lib/queries/analytics'
import { pickText } from '../../lib/admin/roles'
import { CHANNELS, activeFilterCount } from '../../lib/analytics/dashboard'

const rows = (data) => (Array.isArray(data) ? data : data?.results ?? [])

function Field({ label, children, className }) {
  return (
    <label className={`flex min-w-0 flex-col gap-1 ${className ?? ''}`}>
      <span className="text-[11px] font-bold text-muted">{label}</span>
      {children}
    </label>
  )
}

/**
 * 3.1 and 3.2: one filter row drives every number on the page (challenge, dates, sector, district, channel).
 * Filters live in the URL, so a shared link shows the same numbers.
 */
export default function FilterRow({ filters, onChange, onClear, updating }) {
  const t = useT()
  const { lang } = useI18n()
  const programs = usePrograms({ page_size: 100 })
  const sectors = useReferenceList('sectors', lang)
  const districts = useReferenceList('districts', lang)

  const programOptions = useMemo(() => [
    { value: '', label: t('dash.f.allChallenges') },
    ...rows(programs.data).map((p) => ({ value: String(p.id), label: pickText(p.title, lang) || pickText(p.name, lang) })),
  ], [programs.data, t, lang])
  const ref = (data, all) => [{ value: '', label: t(all) }, ...rows(data).map((r) => ({ value: r.slug || String(r.id), label: pickText(r.name, lang) }))]
  const [open, setOpen] = useState(false)
  const gridId = useId()
  const count = activeFilterCount(filters)
  const channelOptions = [{ value: '', label: t('dash.f.allChannels') }, ...CHANNELS.map((c) => ({ value: c, label: t(`dash.ch.${c}`) }))]

  return (
    <section aria-label={t('dash.f.label')} className="mb-3.5 rounded-card border border-border bg-surface p-3">
      {/* Phone: the filters fold away so the summary comes first. */}
      <button type="button" aria-expanded={open} aria-controls={gridId} onClick={() => setOpen((v) => !v)}
        className="flex min-h-[44px] w-full items-center justify-between gap-2 text-[14px] font-bold text-text md:hidden">
        <span className="flex items-center gap-2"><SlidersHorizontal size={16} aria-hidden />{count ? t('dash.f.showCount', { count }) : t('dash.f.show')}</span>
        <ChevronDown size={16} aria-hidden className={open ? 'rotate-180 transition-transform' : 'transition-transform'} />
      </button>
      <div id={gridId} className={`${open ? 'mt-2 grid' : 'hidden'} grid-cols-2 md:mt-0 md:grid gap-2.5 md:grid-cols-3 xl:grid-cols-[minmax(0,1.6fr)_repeat(2,minmax(0,0.9fr))_repeat(3,minmax(0,1fr))_auto] xl:items-end`}>
        <Field label={t('dash.f.challenge')} className="col-span-2 md:col-span-1">
          <SelectControl aria-label={t('dash.f.challenge')} options={programOptions} value={filters.program ?? ''} onChange={(v) => onChange('program', v)} searchable />
        </Field>
        <Field label={t('dash.f.from')}>
          <InputControl type="date" value={filters.from ?? ''} max={filters.to || undefined} onChange={(e) => onChange('from', e.target.value)} />
        </Field>
        <Field label={t('dash.f.to')}>
          <InputControl type="date" value={filters.to ?? ''} min={filters.from || undefined} onChange={(e) => onChange('to', e.target.value)} />
        </Field>
        <Field label={t('dash.f.sector')}>
          <SelectControl aria-label={t('dash.f.sector')} options={ref(sectors.data, 'dash.f.allSectors')} value={filters.sector ?? ''} onChange={(v) => onChange('sector', v)} />
        </Field>
        <Field label={t('dash.f.district')}>
          <SelectControl aria-label={t('dash.f.district')} options={ref(districts.data, 'dash.f.allDistricts')} value={filters.district ?? ''} onChange={(v) => onChange('district', v)} searchable />
        </Field>
        <Field label={t('dash.f.channel')}>
          <SelectControl aria-label={t('dash.f.channel')} options={channelOptions} value={filters.channel ?? ''} onChange={(v) => onChange('channel', v)} />
        </Field>
        {count > 0 && (
          <div className="col-span-2 flex items-end md:col-span-1 xl:col-span-1">
            <Button variant="ghost" size="sm" icon={<X size={14} aria-hidden />} onClick={onClear}>{t('dash.f.clear')}</Button>
          </div>
        )}
      </div>
      <p className="sr-only" aria-live="polite">{updating ? t('dash.f.updating') : ''}</p>
    </section>
  )
}
