import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Plus, Search, Trophy } from 'lucide-react'
import PageHeader from '../../components/ui/PageHeader'
import { buttonClasses } from '../../components/ui/buttonClasses'
import Tabs from '../../components/ui/Tabs'
import StatusPill from '../../components/ui/StatusPill'
import DropdownMenu from '../../components/ui/DropdownMenu'
import EmptyState from '../../components/ui/EmptyState'
import ErrorState from '../../components/ui/ErrorState'
import Skeleton from '../../components/ui/Skeleton'
import { InputControl } from '../../components/ui/Input'
import { useT } from '../../i18n/context'
import { usePrograms } from '../../lib/queries/programs'
import { useTabParam } from '../../lib/useTabParam'

// Challenges list. Figma has no frame of its own for it, so it copies the closest list, 3.4 Forms (cards with a
// menu, status tabs and a search). Each card opens the challenge status (3.6 phone 20:840); the menu edits it in the
// builder (3.6b) or opens its workflow and ideas.

const TABS = [
  { key: 'all', status: undefined },
  { key: 'published', status: 'published' },
  { key: 'draft', status: 'draft' },
  { key: 'closed', status: 'closed' },
  { key: 'archived', status: 'archived' },
]

const asList = (data) => (Array.isArray(data) ? data : data?.results ?? [])
const day = (v) => (v ? new Date(v).toLocaleDateString('en-BW', { day: 'numeric', month: 'short', year: 'numeric' }) : null)

export default function Challenges() {
  const t = useT()
  const navigate = useNavigate()
  const [tab, setTab] = useTabParam(TABS.map((x) => ({ ...x, label: x.key })))
  const [query, setQuery] = useState('')
  const programs = usePrograms()
  const all = useMemo(() => asList(programs.data), [programs.data])

  useEffect(() => {
    document.title = `${t('chl.title')} · CEDA Innovation`
  }, [t])

  const counts = Object.fromEntries(TABS.map((x) => [x.key, x.status ? all.filter((p) => p.status === x.status).length : all.filter((p) => p.status !== 'archived').length]))
  const status = TABS.find((x) => x.key === tab)?.status
  const q = query.trim().toLowerCase()
  const shown = all
    .filter((p) => (status ? p.status === status : p.status !== 'archived'))
    .filter((p) => !q || p.title?.toLowerCase().includes(q))

  return (
    <div className="flex flex-col gap-[14px] 2xl:gap-[22px]">
      <PageHeader
        back={<span className="text-[12px] text-muted">{t('chl.crumb')}</span>}
        title={t('chl.title')}
        subtitle={t('chl.subtitle')}
        actions={<Link to="/programs/new" className={buttonClasses()}><Plus size={16} aria-hidden />{t('chl.create')}</Link>}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs tabs={TABS.map((x) => ({ key: x.key, label: t(`chl.tab.${x.key}`), count: counts[x.key] }))} active={tab} onChange={setTab} variant="segment" label={t('chl.title')} idPrefix="chl" />
        <div className="w-full sm:w-[260px]">
          <InputControl type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('chl.search')} aria-label={t('chl.search')} leading={<Search size={16} aria-hidden />} />
        </div>
      </div>

      {programs.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-hidden>{[0, 1, 2].map((i) => <Skeleton key={i} className="h-[180px] rounded-card" />)}</div>
      ) : programs.isError ? (
        <ErrorState framed title={t('chl.loadError')} message={programs.error?.message} onRetry={programs.refetch} />
      ) : shown.length === 0 ? (
        <EmptyState framed icon={Trophy} title={q ? t('chl.emptySearch', { q: query.trim() }) : t('chl.empty')} message={q ? undefined : t('chl.emptyBody')} />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {shown.map((p) => (
            <li key={p.id}>
              <article className="relative flex h-full flex-col gap-2 rounded-card border border-border bg-surface p-4 transition-shadow hover:shadow-card focus-within:ring-2 focus-within:ring-primary">
                <div className="flex items-start gap-2">
                  <span aria-hidden className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-accent-soft text-accent"><Trophy size={20} /></span>
                  <h2 className="min-w-0 flex-1 text-[15px] font-bold leading-5 text-text">
                    <Link to={`/programs/${p.id}`} className="after:absolute after:inset-0 focus-visible:outline-none">{p.is_general_intake ? t('wfl.generalIdeas') : p.title}</Link>
                  </h2>
                  <div className="relative z-10">
                    <DropdownMenu
                      label={t('chl.menu', { name: p.title })}
                      items={[
                        { key: 'status', label: t('chl.status'), onSelect: () => navigate(`/programs/${p.id}`) },
                        { key: 'edit', label: t('chl.edit'), onSelect: () => navigate(`/programs/${p.id}/edit`) },
                        { key: 'workflow', label: t('chl.workflow'), hidden: !p.active_workflow_definition, onSelect: () => navigate(`/admin/workflows/${p.active_workflow_definition?.id}/builder`) },
                        { key: 'ideas', label: t('chl.ideas'), onSelect: () => navigate(`/submissions?program=${p.id}`) },
                      ]}
                    />
                  </div>
                </div>
                <p className="text-[12px] text-muted">{p.program_type?.name}</p>
                <div className="mt-auto flex flex-wrap items-center gap-2">
                  <StatusPill status={p.status} />
                  {p.closing_date && <span className="text-[12px] text-muted">{t('chl.closes', { date: day(p.closing_date) })}</span>}
                </div>
              </article>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
