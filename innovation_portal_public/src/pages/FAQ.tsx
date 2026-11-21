import { useMemo, useState } from 'react'
import { ChevronDown, Search, X } from 'lucide-react'
import PageBanner from '../components/layout/PageBanner'
import HelpContactCard from '../components/help/HelpContactCard'
import Skeleton from '../components/ui/Skeleton'
import EmptyState, { ErrorState } from '../components/ui/EmptyState'
import { useI18n } from '../i18n'
import { useAsync } from '../lib/useAsync'
import { usePageTitle } from '../lib/usePageTitle'
import { faqsService } from '../services/faqs.service'
import type { ApiFAQ } from '../types/api'

// Help (/faq), in the Option D look of 1.6 and 1.7: the page banner with the CEDA mark watermark and a search
// box, the questions in their groups (B6 FAQ groups, in the order the admins set), and "Still need help?" at
// the foot. Shown: questions placed on Help, and older questions with no placement, but never a question that
// belongs to one challenge's page.

interface Group {
  id: string
  name: string
  items: ApiFAQ[]
}

const OTHER = 'other'

function forHelp(f: ApiFAQ) {
  return !f.program && (!f.placements?.length || f.placements.includes('help'))
}

/** Keeps the API order: groups in the order their first question arrives, ungrouped ones last. */
function toGroups(list: ApiFAQ[], otherName: string): Group[] {
  const groups = new Map<string, Group>()
  for (const f of list) {
    const id = f.group ?? OTHER
    if (!groups.has(id)) groups.set(id, { id, name: f.group ? f.group_name || otherName : otherName, items: [] })
    groups.get(id)!.items.push(f)
  }
  const other = groups.get(OTHER)
  groups.delete(OTHER)
  return other ? [...groups.values(), other] : [...groups.values()]
}

function Question({ faq }: { faq: ApiFAQ }) {
  return (
    <details className="group border-b border-border last:border-b-0 open:bg-surface2">
      <summary className="flex items-center justify-between gap-3 px-4 lg:px-5 py-4 cursor-pointer list-none text-d-h5 font-heading text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary [&::-webkit-details-marker]:hidden">
        {faq.question}
        <ChevronDown size={18} aria-hidden className="shrink-0 text-primary transition-transform group-open:rotate-180" />
      </summary>
      <p className="px-4 lg:px-5 pb-4 -mt-1 text-d-body-s text-muted whitespace-pre-line">{faq.answer}</p>
    </details>
  )
}

function ListSkeleton() {
  return (
    <div aria-hidden className="flex flex-col gap-8">
      {Array.from({ length: 2 }).map((_, g) => (
        <div key={g} className="flex flex-col gap-3">
          <Skeleton className="h-6 w-48" />
          <div className="rounded-card border border-border">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-[58px] px-5 flex items-center border-b border-border last:border-b-0">
                <Skeleton className="h-4 w-3/4" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

export default function FAQ() {
  const { t, lang } = useI18n()
  usePageTitle(t('nav.help'))
  const res = useAsync(() => faqsService.getPublic(lang), [lang])
  const [q, setQ] = useState('')
  const term = q.trim().toLowerCase()

  const all = useMemo(() => (res.data ?? []).filter(forHelp), [res.data])
  const shown = useMemo(
    () => (term ? all.filter((f) => f.question.toLowerCase().includes(term) || f.answer.toLowerCase().includes(term)) : all),
    [all, term],
  )
  const groups = useMemo(() => toGroups(shown, t('help.other')), [shown, t])
  const topics = term ? [] : groups

  return (
    <>
      <PageBanner id="help-title" overline={t('help.over')} title={t('help.title')} subtitle={t('help.sub')}>
        <form role="search" onSubmit={(e) => e.preventDefault()} className="relative max-w-[560px]">
          <Search size={18} aria-hidden className="absolute left-4 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t('help.search')}
            aria-label={t('help.search')}
            className="w-full h-12 pl-11 pr-11 rounded-control bg-surface text-text text-d-body-s placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-yellow [&::-webkit-search-cancel-button]:hidden"
          />
          {q && (
            <button type="button" onClick={() => setQ('')} aria-label={t('help.clear')} className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-control text-muted hover:bg-surface2 flex items-center justify-center">
              <X size={16} aria-hidden />
            </button>
          )}
        </form>
      </PageBanner>

      <div className="max-w-[1200px] mx-auto px-5 lg:px-6 py-10 lg:py-[72px] flex flex-col gap-12 lg:gap-16">
        <p role="status" aria-live="polite" className={term && res.data ? 'text-d-label-s text-muted -mb-6 lg:-mb-10' : 'sr-only'}>
          {term && res.data ? (shown.length === 1 ? t('help.countOne', { q: q.trim() }) : shown.length ? t('help.count', { n: shown.length, q: q.trim() }) : '') : ''}
        </p>

        {res.loading ? (
          <ListSkeleton />
        ) : res.error && !res.data ? (
          <ErrorState title={t('help.loadError')} onRetry={res.reload} retrying={res.fetching} />
        ) : all.length === 0 ? (
          <EmptyState title={t('help.empty')} body={t('help.emptyBody')} />
        ) : shown.length === 0 ? (
          <EmptyState title={t('help.noMatch', { q: q.trim() })} body={t('help.noMatchBody')} />
        ) : (
          <div className={topics.length > 1 ? 'grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-10' : ''}>
            {topics.length > 1 && (
              <nav aria-label={t('help.topics')} className="hidden lg:block">
                <div className="sticky top-6 flex flex-col gap-1">
                  <p className="text-d-over uppercase font-heading text-accent mb-2">{t('help.topics')}</p>
                  {topics.map((g) => (
                    <a key={g.id} href={`#faq-group-${g.id}`} className="px-3 py-2 rounded-control text-d-label text-text hover:bg-surface2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                      {g.name}
                    </a>
                  ))}
                </div>
              </nav>
            )}
            <div className="flex flex-col gap-10 min-w-0">
              {groups.map((g) => (
                <section key={g.id} id={`faq-group-${g.id}`} aria-labelledby={`faq-group-${g.id}-title`} className="scroll-mt-6 flex flex-col gap-3">
                  {/* A single group of ungrouped questions needs no heading on screen. */}
                  <h2 id={`faq-group-${g.id}-title`} className={groups.length > 1 || g.id !== OTHER ? 'text-d-h4 font-heading text-text' : 'sr-only'}>{g.name}</h2>
                  <div className="rounded-card border border-border overflow-hidden">
                    {g.items.map((f) => <Question key={f.id} faq={f} />)}
                  </div>
                </section>
              ))}
            </div>
          </div>
        )}

        <HelpContactCard id="help-contact-title" />
      </div>
    </>
  )
}
