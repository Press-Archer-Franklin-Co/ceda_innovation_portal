import { useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { SlidersHorizontal } from 'lucide-react'
import clsx from 'clsx'
import Button from '../components/ui/Button'
import Modal from '../components/ui/Modal'
import Select, { SelectControl } from '../components/ui/Select'
import Skeleton from '../components/ui/Skeleton'
import EmptyState, { ErrorState } from '../components/ui/EmptyState'
import PageBanner from '../components/layout/PageBanner'
import SectionHead from '../components/home/SectionHead'
import ChallengeCard, { GeneralIdeaCard } from '../components/challenges/ChallengeCard'
import { useI18n } from '../i18n'
import { useAsync } from '../lib/useAsync'
import { referenceService } from '../services/reference.service'
import { publicContent, ChallengeStatus } from '../services/publicContent.service'

// Screen 1.7 Challenges (Figma 13:973 website, 13:1285 phone). GET /api/programs/public/challenges/ (B5).
// Open calls first, sorted by closing date; a bar shows how much of the entry window has passed (red under
// 3 days). Closed calls keep their results public. The general-idea card is always there. Filters live in the
// URL; on phone they open in a sheet.

type Sort = 'closing_soon' | 'newest'

function Count({ n, label }: { n: number; label: string }) {
  return (
    <span className="inline-flex items-baseline gap-1.5">
      <span className="font-heading font-extrabold text-[32px] leading-none text-amber">{n}</span>
      <span className="text-d-label-s">{label}</span>
    </span>
  )
}

export default function Challenges() {
  const { t, lang } = useI18n()
  const [params, setParams] = useSearchParams()
  const status = (params.get('status') as ChallengeStatus | null) ?? ''
  const sector = params.get('sector') ?? ''
  const sort = (params.get('sort') as Sort | null) ?? 'closing_soon'
  const [sheet, setSheet] = useState(false)
  const filtersRef = useRef<HTMLButtonElement>(null)

  const set = (patch: Record<string, string>) =>
    setParams((p) => {
      const next = new URLSearchParams(p)
      Object.entries(patch).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k)))
      return next
    }, { replace: true })

  // One call for counts and the current list; closed calls come from the same list when no status is chosen.
  const list = useAsync(() => publicContent.challenges({ sector, sort }), [sector, sort, lang])
  const sectors = useAsync(() => referenceService.sectors(lang), [lang])

  const all = list.data?.results ?? []
  const counts = list.data?.counts ?? { open: 0, upcoming: 0, closed: 0, all: 0 }
  const current = status ? all.filter((c) => c.status === status) : all.filter((c) => c.status !== 'closed')
  const closed = status ? [] : all.filter((c) => c.status === 'closed')
  const closedWithResults = all.filter((c) => c.status === 'closed' && c.has_results).length

  const sectorOptions = [{ value: '', label: t('chl.allSectors') }, ...(sectors.data ?? []).map((s) => ({ value: s.slug, label: s.name }))]
  const sortOptions = [{ value: 'closing_soon', label: t('chl.sortClosing') }, { value: 'newest', label: t('chl.sortNewest') }]

  const title = t('chl.title')
  const hl = t('chl.highlight')
  const at = title.lastIndexOf(hl)

  return (
    <>
      <PageBanner
          id="challenges-page-title"
          overline={t('chl.over')}
          title={at > 0 ? <>{title.slice(0, at)}<span className="text-amber">{title.slice(at)}</span></> : title}
          subtitle={t('chl.sub')}
        >
          {list.data && (
            <p className="flex flex-wrap gap-x-7 gap-y-3">
              <Count n={counts.open} label={t('chl.openNow')} />
              <Count n={counts.upcoming} label={t('chl.upcoming')} />
              <Count n={closedWithResults} label={t('chl.closedResults')} />
            </p>
          )}
        </PageBanner>

      <div className="max-w-[1200px] mx-auto px-5 lg:px-6 py-10 lg:py-[72px]">
        <div className="flex flex-wrap items-center gap-3 mb-7">
          <div role="group" aria-label={t('chl.statusFilter')} className="flex gap-2 overflow-x-auto -mx-5 px-5 sm:mx-0 sm:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {(['open', 'upcoming', 'closed'] as ChallengeStatus[]).map((s) => {
              const on = status === s
              return (
                <button
                  key={s}
                  type="button"
                  aria-pressed={on}
                  onClick={() => set({ status: on ? '' : s })}
                  className={clsx(
                    'shrink-0 min-h-[32px] px-3 rounded-full text-d-label-s border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                    on ? 'bg-primary border-primary text-on-primary' : 'bg-surface border-border text-text hover:border-muted/60',
                  )}
                >
                  {t(`chl.filter.${s}`)} ({counts[s]})
                </button>
              )
            })}
          </div>
          <div className="hidden md:flex items-center gap-3 ml-auto">
            <SelectControl aria-label={t('chl.sector')} className="w-[220px]" options={sectorOptions} value={sector} onChange={(v) => set({ sector: v })} />
            <SelectControl aria-label={t('chl.sort')} className="w-[220px]" options={sortOptions} value={sort} onChange={(v) => set({ sort: v === 'closing_soon' ? '' : v })} />
          </div>
          <Button ref={filtersRef} variant="secondary" size="sm" className="md:hidden ml-auto" icon={<SlidersHorizontal size={16} aria-hidden />} onClick={() => setSheet(true)}>
            {t('chl.filters')}
          </Button>
        </div>

        {/* Hidden heading keeps the order h1 > h2 > card h3 for screen readers. */}
        <h2 className="sr-only">{t('chl.listTitle')}</h2>
        {list.loading ? (
          <div aria-hidden className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-[300px] rounded-card" />)}
          </div>
        ) : list.error && !list.data ? (
          <ErrorState title={t('chl.loadError')} body={t('home.loadErrorBody')} onRetry={list.reload} retrying={list.fetching} />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6" aria-busy={list.fetching || undefined}>
            {current.length === 0 && status === 'closed' ? (
              <EmptyState title={t('chl.empty')} body={t('chl.emptyBody')} className="sm:col-span-2 lg:col-span-3" />
            ) : (
              current.map((c) => <ChallengeCard key={c.id} challenge={c} showWindow />)
            )}
            {status !== 'closed' && <GeneralIdeaCard />}
          </div>
        )}
      </div>

      {closed.length > 0 && (
        <section aria-labelledby="closed-title" className="bg-surface2">
          <div className="max-w-[1200px] mx-auto px-5 lg:px-6 py-12 lg:py-[72px]">
            <SectionHead id="closed-title" overline={t('chl.closedOver')} title={t('chl.closedTitle')} />
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {closed.map((c) => <ChallengeCard key={c.id} challenge={c} />)}
            </div>
          </div>
        </section>
      )}

      <Modal open={sheet} onClose={() => setSheet(false)} triggerRef={filtersRef} title={t('chl.filters')} footer={<Button block onClick={() => setSheet(false)}>{t('chl.apply')}</Button>}>
        <div className="flex flex-col gap-4">
          <Select label={t('chl.sector')} options={sectorOptions} value={sector} onChange={(v) => set({ sector: v })} />
          <Select label={t('chl.sort')} options={sortOptions} value={sort} onChange={(v) => set({ sort: v === 'closing_soon' ? '' : v })} />
        </div>
      </Modal>
    </>
  )
}
