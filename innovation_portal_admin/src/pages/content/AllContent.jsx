import { useEffect, useState } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Plus, Search } from 'lucide-react'
import PageHeader from '../../components/ui/PageHeader'
import Button from '../../components/ui/Button'
import DataTable from '../../components/ui/DataTable'
import DropdownMenu from '../../components/ui/DropdownMenu'
import Tag from '../../components/ui/Tag'
import StatusPill from '../../components/ui/StatusPill'
import { InputControl } from '../../components/ui/Input'
import { SelectControl } from '../../components/ui/Select'
import { useT } from '../../i18n/context'
import { client } from '../../lib/api/client'
import { relativeTime } from '../../lib/forms/format'
import { LANGS, NEW_TYPES, PAGE_SIZE, STATUSES, TYPES, allParams, fromAll } from '../../lib/content/allContent'

// 3.38 All content (Figma 141:2509 website, 141:2846 phone). ① Filter by type, status and language; search titles.
// ② One table for pages, posts, stories, quotes, partners, FAQs and policies, with who changed it last and whether a
// Setswana version exists. ③ New opens a small menu to pick the type, then the right editor. Rows waiting for
// approval link to 3.25. Phone: the same rows as cards (DataTable).
// Rows come from GET /api/content/all/ (R-59 part 1 and R-62), which pages, searches, filters and sorts them
// (newest change first; the frame has no sort control).

const TYPE_TONE = { page: 'dark', news: 'blue', story: 'green', quote: 'amber', partner: 'neutral', faq: 'orange', policy: 'cms' }

function useAllContent(filters) {
  const params = allParams(filters)
  return useQuery({
    queryKey: ['content', 'all', params],
    queryFn: () => client.get('/api/content/all/', params),
    placeholderData: keepPreviousData,
  })
}

/** The search box waits 300 ms after the last key before it asks the server. */
function useDebounced(value, ms = 300) {
  const [v, setV] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms)
    return () => clearTimeout(id)
  }, [value, ms])
  return v
}

// Old links (/content?tab=...) open the screen that replaced each tab.
const MOVED = { news: '/content/news', winners: '/content/winners', hackathons: '/content/hackathon', leadership: '/content/quotes', faqs: '/content/faqs' }

export default function AllContent() {
  const [params] = useSearchParams()
  const moved = MOVED[params.get('tab')]
  return moved ? <Navigate to={moved} replace /> : <AllContentTable />
}

function AllContentTable() {
  const t = useT()
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const [type, setType] = useState('')
  const [status, setStatus] = useState('')
  const [lang, setLang] = useState('')

  const search = useDebounced(q)
  // A new filter or search starts again from the first page (worked out in render, so no request goes out for
  // the old page with the new filters).
  const filterKey = JSON.stringify([type, status, lang, search])
  const [paging, setPaging] = useState({ filterKey, page: 1 })
  const page = paging.filterKey === filterKey ? paging.page : 1
  const setPage = (p) => setPaging({ filterKey, page: p })
  const all = useAllContent({ type, status, lang, q: search, page })

  useEffect(() => { document.title = `${t('all.title')} · CEDA Innovation` }, [t])

  const homeTitle = (r) => (r.type === 'page' && r.id === 'home' ? { ...r, title: t('all.homePage') } : r)
  const rows = (all.data?.results ?? []).map(fromAll).filter(Boolean).map(homeTitle)
  const total = all.data?.count ?? rows.length
  const filtered = Boolean(q || type || status || lang)

  const columns = [
    { key: 'title', label: t('all.col.title'), render: (v) => <span className="font-bold text-text">{v || t('all.untitled')}</span> },
    { key: 'type', label: t('all.col.type'), render: (v) => <Tag tone={TYPE_TONE[v]}>{t(`all.type.${v}`)}</Tag> },
    {
      key: 'hasSetswana',
      label: t('all.col.setswana'),
      render: (v) => (v === null ? <span className="text-muted" aria-label={t('all.noSetswanaNeeded')}>–</span> : v ? t('all.yes') : <span className="font-bold text-danger">{t('all.no')}</span>),
    },
    { key: 'status', label: t('all.col.status'), render: (v) => <StatusPill status={v} /> },
    {
      key: 'updatedAt',
      label: t('all.col.changed'),
      hideOnPhone: false,
      render: (v, r) => <span className="text-[13px] text-muted">{[r.updatedBy, relativeTime(v, t)].filter(Boolean).join(' · ')}</span>,
    },
    {
      key: 'menu',
      label: <span className="sr-only">{t('all.col.actions')}</span>,
      align: 'right',
      render: (_, r) => (
        <span onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()} role="presentation">
          <DropdownMenu
            label={t('all.menu', { title: r.title })}
            items={[
              { key: 'open', label: t('all.open'), onSelect: () => navigate(r.href) },
              { key: 'approval', label: t('all.review'), hidden: r.status !== 'pending_approval', onSelect: () => navigate('/content/approvals') },
            ]}
          />
        </span>
      ),
    },
  ]

  return (
    <div className="flex flex-col gap-[14px] 2xl:gap-[22px]">
      <PageHeader
        back={<span className="text-[12px] text-muted">{t('all.crumb')}</span>}
        title={t('all.title')}
        subtitle={t('all.subtitle')}
        actions={
          <DropdownMenu
            label={t('all.new')}
            trigger={(props) => <Button {...props} icon={<Plus size={16} aria-hidden />}>{t('all.new')}</Button>}
            items={NEW_TYPES.map((n) => ({ key: n.type, label: t(`all.newType.${n.type}`), onSelect: () => navigate(n.href) }))}
          />
        }
      />

      <div className="grid grid-cols-2 gap-2 md:flex md:flex-wrap md:items-center">
        <div className="col-span-2 md:w-[300px]">
          <InputControl type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('all.search')} aria-label={t('all.search')} leading={<Search size={16} aria-hidden />} />
        </div>
        <div className="md:w-[150px]"><SelectControl aria-label={t('all.col.type')} options={[{ value: '', label: t('all.allTypes') }, ...TYPES.map((x) => ({ value: x, label: t(`all.type.${x}`) }))]} value={type} onChange={setType} /></div>
        <div className="md:w-[180px]"><SelectControl aria-label={t('all.col.status')} options={[{ value: '', label: t('all.allStatuses') }, ...STATUSES.map((x) => ({ value: x, label: t(`all.status.${x}`) }))]} value={status} onChange={setStatus} /></div>
        <div className="col-span-2 md:w-[190px]"><SelectControl aria-label={t('all.language')} options={[{ value: '', label: t('all.anyLanguage') }, ...LANGS.map((x) => ({ value: x, label: t(x === 'tn' ? 'all.hasSetswana' : 'all.missingSetswana') }))]} value={lang} onChange={setLang} /></div>
      </div>

      <DataTable
        columns={columns}
        data={rows}
        rowKey="key"
        loading={all.isLoading}
        error={all.isError ? t('all.loadError') : undefined}
        onRetry={() => all.refetch()}
        retrying={all.isFetching && all.isError}
        onRowClick={(r) => navigate(r.href)}
        pageSize={PAGE_SIZE}
        page={page}
        total={total}
        onPageChange={setPage}
        emptyTitle={filtered ? t('all.emptyFilter') : t('all.empty')}
        emptyMessage={filtered ? t('all.emptyFilterBody') : undefined}
        caption={t('all.title')}
      />
    </div>
  )
}
