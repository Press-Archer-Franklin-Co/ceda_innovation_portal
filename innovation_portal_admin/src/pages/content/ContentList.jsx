import React, { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Plus, FileText, Trophy, Megaphone, Star } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import PageHeader from '../../components/ui/PageHeader'
import StatusPill from '../../components/ui/StatusPill'
import EmptyState from '../../components/ui/EmptyState'
import ErrorState from '../../components/ui/ErrorState'
import Tabs from '../../components/ui/Tabs'
import { SkeletonCards } from '../../components/ui/LoadingSkeleton'
import { content } from '../../lib/api/endpoints'
import { cn } from '../../lib/cn'
import LeadershipList from './LeadershipManager'
import FaqList from './FaqManager'

const CATEGORY_COLOR = {
  announcement:    'bg-blue-50 text-blue-700',
  challenge_update:'bg-green-50 text-green-700',
  winners:         'bg-yellow-50 text-yellow-700',
  partnership:     'bg-purple-50 text-purple-700',
  success_story:   'bg-orange-50 text-orange-700',
}

const CATEGORY_LABEL = {
  announcement:    'Announcement',
  challenge_update:'Challenge Update',
  winners:         'Winners',
  partnership:     'Partnership',
  success_story:   'Success Story',
}

const TABS = [
  { key: 'news',       label: 'News & Articles' },
  { key: 'hackathons', label: 'Hackathon Pages' },
  { key: 'winners',    label: 'Winners' },
  { key: 'leadership', label: 'Leadership Carousel' },
  { key: 'faqs',       label: 'FAQs' },
]

function NewsCard({ item, onClick }) {
  return (
    <div onClick={onClick} className="card-hover cursor-pointer overflow-hidden flex flex-col">
      <div className="h-1.5 flex-shrink-0 bg-ceda-green" />
      <div className="p-5 flex flex-col flex-1">
        <div className="flex items-start justify-between gap-2 mb-3">
          <span className={cn('badge text-[11px]', CATEGORY_COLOR[item.category] ?? 'bg-ceda-surface text-ceda-muted')}>
            {CATEGORY_LABEL[item.category] ?? item.category}
          </span>
          <div className="flex items-center gap-1.5">
            {item.is_highlighted && (
              <span className="badge bg-amber-50 text-amber-700 text-[11px]">
                <Star size={10} className="mr-0.5 inline" />
                {item.highlight_priority ? `Homepage #${item.highlight_priority}` : 'Highlighted'}
              </span>
            )}
            <StatusPill status={item.status} />
          </div>
        </div>
        <h3 className="text-sm font-semibold text-ceda-dark mb-1 line-clamp-2 flex-1">{item.title}</h3>
        <p className="text-xs text-ceda-muted line-clamp-2 mb-4">{item.excerpt}</p>
        <div className="flex items-center justify-between pt-3 border-t border-ceda-border/60 text-[11px] text-ceda-muted">
          <span>{item.read_time || '—'}</span>
          <span>{item.published_at ? new Date(item.published_at).toLocaleDateString() : 'Not published'}</span>
        </div>
      </div>
    </div>
  )
}

function HackathonCard({ item, onClick }) {
  return (
    <div onClick={onClick} className="card-hover cursor-pointer overflow-hidden flex flex-col">
      <div className="h-1.5 flex-shrink-0 bg-amber-500" />
      <div className="p-5 flex flex-col flex-1">
        <div className="flex items-center justify-between gap-2 mb-3">
          <span className="badge bg-amber-50 text-amber-700 text-[11px]">Hackathon Page</span>
          <StatusPill status={item.is_published ? 'published' : 'draft'} />
        </div>
        <h3 className="text-sm font-semibold text-ceda-dark mb-1 line-clamp-2 flex-1">{item.program_title}</h3>
        <p className="text-xs text-ceda-muted line-clamp-2 mb-4">{item.theme || 'No theme set'}</p>
        <div className="flex items-center justify-between pt-3 border-t border-ceda-border/60 text-[11px] text-ceda-muted">
          <span>{(item.media ?? []).length} media file{item.media?.length !== 1 ? 's' : ''}</span>
          <span>{item.faq?.length ?? 0} FAQ{item.faq?.length !== 1 ? 's' : ''}</span>
        </div>
      </div>
    </div>
  )
}

function WinnerCard({ item, onClick }) {
  return (
    <div onClick={onClick} className="card-hover cursor-pointer overflow-hidden flex flex-col">
      <div className="h-1.5 flex-shrink-0 bg-yellow-500" />
      <div className="p-5 flex flex-col flex-1">
        <div className="flex items-center justify-between gap-2 mb-3">
          <span className="badge bg-yellow-50 text-yellow-700 text-[11px]">{item.position_display}</span>
          {item.is_featured && (
            <span className="badge bg-amber-50 text-amber-700 text-[11px]">
              <Star size={10} className="mr-0.5 inline" />Featured
            </span>
          )}
        </div>
        <h3 className="text-sm font-semibold text-ceda-dark mb-0.5">{item.team_name}</h3>
        <p className="text-xs text-ceda-muted mb-1">{item.project_name}</p>
        <p className="text-[11px] text-ceda-muted line-clamp-2 flex-1">{item.description}</p>
        <div className="flex items-center justify-between pt-3 mt-3 border-t border-ceda-border/60 text-[11px] text-ceda-muted">
          <span>{item.program_title}</span>
          <span>{item.year}</span>
        </div>
      </div>
    </div>
  )
}

export default function ContentList() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [tab, setTab] = useState(searchParams.get('tab') || 'news')

  useEffect(() => {
    const t = searchParams.get('tab')
    if (t && t !== tab) setTab(t)
  }, [searchParams])

  const handleTabChange = (t) => {
    setTab(t)
    setSearchParams({ tab: t })
  }

  const newsQuery       = useQuery({ queryKey: ['content-news'],      queryFn: () => content.list(),       enabled: tab === 'news' })
  const hackathonsQuery = useQuery({ queryKey: ['content-hackathons'], queryFn: () => content.hackathons(), enabled: tab === 'hackathons' })
  const winnersQuery    = useQuery({ queryKey: ['content-winners'],   queryFn: () => content.winners(),    enabled: tab === 'winners' })

  const q = tab === 'news' ? newsQuery : tab === 'hackathons' ? hackathonsQuery : winnersQuery

  const createActions = {
    news:       () => navigate('/content/news/new'),
    hackathons: () => navigate('/content/hackathons/new'),
    winners:    () => navigate('/content/winners/new'),
    leadership: () => navigate('/content/leadership/new'),
    faqs:       () => navigate('/content/faqs/new'),
  }

  const actionLabel = {
    news:       'New Article',
    hackathons: 'New Hackathon Page',
    winners:    'Add Winner',
    leadership: 'Add Card',
    faqs:       'New FAQ',
  }

  const items = Array.isArray(q?.data) ? q.data : (q?.data?.results ?? [])

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Content Management"
        subtitle="Manage news, hackathon pages, winner spotlights, leadership carousel and FAQs"
        icon={<FileText size={20} />}
        actions={
          <button className="btn-primary flex items-center gap-1.5" onClick={createActions[tab]}>
            <Plus size={15} />
            {actionLabel[tab]}
          </button>
        }
      />

      <Tabs tabs={TABS} active={tab} onChange={handleTabChange} />

      {tab === 'leadership' && <LeadershipList embedded />}

      {tab === 'faqs' && <FaqList embedded />}

      {tab !== 'leadership' && tab !== 'faqs' && (
        <>
          {q?.isLoading && <SkeletonCards count={6} />}

          {q?.isError && (
            <ErrorState
              message={q.error?.message ?? 'Failed to load content'}
              onRetry={q.refetch}
            />
          )}

          {!q?.isLoading && !q?.isError && items.length === 0 && (
            <EmptyState
              icon={tab === 'winners' ? Trophy : Megaphone}
              title={tab === 'news' ? 'No articles yet' : tab === 'hackathons' ? 'No hackathon pages yet' : 'No winners yet'}
              message={
                tab === 'news'
                  ? 'Create news articles and announcements to show in the public Innovation Feed.'
                  : tab === 'hackathons'
                  ? 'Add rich content pages for hackathon programs.'
                  : 'Feature winning teams to showcase impact.'
              }
              action={
                <button className="btn-primary flex items-center gap-1.5" onClick={createActions[tab]}>
                  <Plus size={14} />
                  {actionLabel[tab]}
                </button>
              }
            />
          )}

          {!q?.isLoading && !q?.isError && items.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {tab === 'news' && items.map(item => (
                <NewsCard key={item.id} item={item} onClick={() => navigate(`/content/news/${item.id}`)} />
              ))}
              {tab === 'hackathons' && items.map(item => (
                <HackathonCard key={item.id} item={item} onClick={() => navigate(`/content/hackathons/${item.id}`)} />
              ))}
              {tab === 'winners' && items.map(item => (
                <WinnerCard key={item.id} item={item} onClick={() => navigate(`/content/winners/${item.id}`)} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
