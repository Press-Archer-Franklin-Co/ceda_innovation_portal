import { useMemo, useState } from 'react'
import { ChevronDown, FileText, LayoutGrid, Lightbulb, LucideIcon, MessageCircle, Search, ShieldCheck, Trophy, X } from 'lucide-react'
import clsx from 'clsx'
import PageBanner from '../components/layout/PageBanner'
import StillNeedHelp from '../components/help/StillNeedHelp'
import Skeleton from '../components/ui/Skeleton'
import EmptyState, { ErrorState } from '../components/ui/EmptyState'
import { useI18n } from '../i18n'
import { useAsync } from '../lib/useAsync'
import { usePageTitle } from '../lib/usePageTitle'
import { faqsService } from '../services/faqs.service'
import type { ApiFAQ } from '../types/api'

// Figma 1.11 Help centre (138:840 website, 138:1238 phone).
// ① Search answers as you type. ② Topics group the FAQs managed in 3.14 (one card per FAQ group, in the
// order the admins set; on phones the cards scroll sideways). ③ Popular questions open in place; picking a
// topic shows that topic's questions in the same box. ④ "Still need help?" beside it.
// Shown: questions placed on Help, and older questions with no placement, but never a question that belongs
// to one challenge's page.

interface Group {
  id: string
  name: string
  items: ApiFAQ[]
}

const OTHER = 'other'
const POPULAR = 6
// The groups have no icon of their own, so the cards take the frame's icons in order.
const ICONS: LucideIcon[] = [Lightbulb, FileText, Trophy, MessageCircle, ShieldCheck, LayoutGrid]

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

function Question({ faq, open }: { faq: ApiFAQ; open: boolean }) {
  return (
    <details open={open} className="group border-t border-border">
      <summary className="flex items-center gap-3 px-[18px] py-[14px] cursor-pointer list-none text-d-label text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary [&::-webkit-details-marker]:hidden">
        <span className="flex-1 min-w-0">{faq.question}</span>
        <ChevronDown size={16} aria-hidden className="shrink-0 text-muted transition-transform group-open:rotate-180" />
      </summary>
      <p className="px-[18px] pb-[14px] -mt-1.5 text-d-body-s text-muted whitespace-pre-line">{faq.answer}</p>
    </details>
  )
}

function TopicCard({ group, icon: Icon, selected, onSelect }: { group: Group; icon: LucideIcon; selected: boolean; onSelect: () => void }) {
  const { t } = useI18n()
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={clsx(
        'w-[200px] lg:w-auto shrink-0 text-left rounded-card border p-[18px] flex flex-col gap-2.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
        selected ? 'border-primary bg-primary-soft' : 'border-border bg-bg hover:bg-surface2',
      )}
    >
      <span aria-hidden className="w-9 h-9 rounded-[10px] bg-accent-soft text-accent flex items-center justify-center">
        <Icon size={18} />
      </span>
      <span className="flex flex-col min-w-0">
        <span className="text-d-h5 font-heading text-text truncate">{group.name}</span>
        <span className="text-d-cap text-muted">{group.items.length === 1 ? t('help.answersOne') : t('help.answers', { n: group.items.length })}</span>
      </span>
    </button>
  )
}

function PageSkeleton() {
  return (
    <div aria-hidden className="flex flex-col gap-7">
      <div className="flex gap-4 overflow-hidden lg:grid lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-[112px] w-[200px] lg:w-auto shrink-0 rounded-card" />)}
      </div>
      <div className="rounded-card border border-border">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-[50px] px-[18px] flex items-center border-t border-border first:border-t-0">
            <Skeleton className="h-4 w-3/4" />
          </div>
        ))}
      </div>
    </div>
  )
}

export default function FAQ() {
  const { t, lang } = useI18n()
  usePageTitle(t('nav.help'))
  const res = useAsync(() => faqsService.getPublic(lang), [lang])
  const [q, setQ] = useState('')
  const [topic, setTopic] = useState<string | null>(null)
  const term = q.trim().toLowerCase()

  const all = useMemo(() => (res.data ?? []).filter(forHelp), [res.data])
  const groups = useMemo(() => toGroups(all, t('help.other')), [all, t])
  const showTopics = groups.length > 1
  const current = showTopics ? groups.find((g) => g.id === topic) ?? null : null

  const matches = useMemo(
    () => (term ? all.filter((f) => f.question.toLowerCase().includes(term) || f.answer.toLowerCase().includes(term)) : []),
    [all, term],
  )
  const list = term ? matches : current ? current.items : showTopics ? all.slice(0, POPULAR) : all
  const boxTitle = term ? t('help.matches', { q: q.trim() }) : current ? current.name : t('help.popular')

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
            className="w-full h-12 pl-11 pr-11 rounded-[10px] bg-bg text-text text-d-body-s placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-yellow [&::-webkit-search-cancel-button]:hidden"
          />
          {q && (
            <button type="button" onClick={() => setQ('')} aria-label={t('help.clear')} className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-control text-muted hover:bg-surface2 flex items-center justify-center">
              <X size={16} aria-hidden />
            </button>
          )}
        </form>
      </PageBanner>

      <div className="max-w-[1200px] mx-auto px-4 lg:px-6 py-6 lg:py-12 flex flex-col gap-7">
        <p role="status" aria-live="polite" className="sr-only">
          {term && res.data ? (matches.length === 1 ? t('help.countOne', { q: q.trim() }) : matches.length ? t('help.count', { n: matches.length, q: q.trim() }) : t('help.noMatch', { q: q.trim() })) : ''}
        </p>

        {res.loading ? (
          <PageSkeleton />
        ) : res.error && !res.data ? (
          <ErrorState title={t('help.loadError')} onRetry={res.reload} retrying={res.fetching} />
        ) : (
          <>
            {showTopics && !term && (
              <nav aria-label={t('help.topics')} className="-mx-4 px-4 lg:mx-0 lg:px-0 overflow-x-auto lg:overflow-visible">
                <div className="flex gap-4 lg:grid lg:grid-cols-3 w-max lg:w-auto pb-1 lg:pb-0">
                  {groups.map((g, i) => (
                    <TopicCard key={g.id} group={g} icon={ICONS[i % ICONS.length]} selected={g.id === topic} onSelect={() => setTopic(g.id === topic ? null : g.id)} />
                  ))}
                </div>
              </nav>
            )}

            <div className="flex flex-col lg:flex-row gap-6 items-start">
              <section aria-labelledby="help-list-title" className="w-full flex-1 min-w-0 rounded-card border border-border overflow-hidden">
                <div className="flex items-center justify-between gap-3 px-[18px] py-[14px]">
                  <h2 id="help-list-title" className="text-d-h5 font-heading text-text">{boxTitle}</h2>
                  {current && !term && (
                    <button type="button" onClick={() => setTopic(null)} className="text-d-label-s text-primary hover:underline underline-offset-4 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                      {t('help.allTopics')}
                    </button>
                  )}
                </div>
                {all.length === 0 ? (
                  <div className="border-t border-border p-[18px]">
                    <EmptyState framed={false} title={t('help.empty')} body={t('help.emptyBody')} />
                  </div>
                ) : list.length === 0 ? (
                  <div className="border-t border-border p-[18px]">
                    <EmptyState framed={false} title={t('help.noMatch', { q: q.trim() })} body={t('help.noMatchBody')} />
                  </div>
                ) : (
                  list.map((f, i) => <Question key={`${boxTitle}-${f.id}`} faq={f} open={i === 0 && !term} />)
                )}
              </section>
              <StillNeedHelp id="help-contact-title" />
            </div>
          </>
        )}
      </div>
    </>
  )
}
