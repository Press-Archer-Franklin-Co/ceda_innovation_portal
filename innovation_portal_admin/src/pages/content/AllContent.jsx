import { useEffect, useMemo, useState } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
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
import { useApprovals, useFaqData, useHomeDraft, usePartners, usePosts, useQuotes, useStories } from '../../lib/queries/websiteContent'
import {
  NEW_TYPES, STATUSES, TYPES, byRecent, filterRows, fromFaq, fromHome, fromPartner, fromPolicy, fromPost, fromQuote, fromStory,
} from '../../lib/content/allContent'

// 3.38 All content (Figma 141:2509 website, 141:2846 phone). ① Filter by type, status and language; search titles.
// ② One table for pages, posts, stories, quotes, partners, FAQs and policies, with who changed it last and whether a
// Setswana version exists. ③ New opens a small menu to pick the type, then the right editor. Rows waiting for
// approval link to 3.25. Phone: the same rows as cards (DataTable).
// Rows come from each type's own list until GET /api/content/all/ exists (TODO(R-59) item 1).

const TYPE_TONE = { page: 'dark', news: 'blue', story: 'green', quote: 'amber', partner: 'neutral', faq: 'orange', policy: 'cms' }

function usePolicyRows() {
  // Policy pages come from U11C (/api/content/policies/). Before it is on main the list answers 404: no rows.
  return useQuery({
    queryKey: ['content', 'policies'],
    queryFn: async () => {
      try {
        const data = await client.get('/api/content/policies/')
        return Array.isArray(data) ? data : data?.results ?? []
      } catch (err) {
        if (err?.status === 404 || err?.status === 405) return []
        throw err
      }
    },
  })
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

  const posts = usePosts()
  const stories = useStories()
  const quotes = useQuotes()
  const partners = usePartners()
  const faqs = useFaqData()
  const home = useHomeDraft()
  const approvals = useApprovals('pending')
  const policies = usePolicyRows()
  const sources = [posts, stories, quotes, partners, faqs, home, policies]

  useEffect(() => { document.title = `${t('all.title')} · CEDA Innovation` }, [t])

  const rows = useMemo(() => {
    const pending = Array.isArray(approvals.data) ? approvals.data : approvals.data?.results ?? []
    const out = [
      ...(home.data ? [{ ...fromHome(home.data, pending), title: t('all.homePage') }] : []),
      ...(posts.data?.results ?? []).map(fromPost),
      ...(stories.data ?? []).map(fromStory),
      ...(quotes.data ?? []).map(fromQuote),
      ...(partners.data ?? []).map(fromPartner),
      ...(faqs.data?.faqs ?? []).map(fromFaq),
      ...(policies.data ?? []).map(fromPolicy),
    ]
    return out.sort(byRecent)
  }, [posts.data, stories.data, quotes.data, partners.data, faqs.data, home.data, policies.data, approvals.data, t])

  const shown = filterRows(rows, { type, status, lang, q })
  const loading = sources.some((s) => s.isLoading)
  const failed = sources.filter((s) => s.isError)
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
        <div className="col-span-2 md:w-[190px]"><SelectControl aria-label={t('all.language')} options={[{ value: '', label: t('all.anyLanguage') }, { value: 'tn', label: t('all.hasSetswana') }, { value: 'missing', label: t('all.missingSetswana') }]} value={lang} onChange={setLang} /></div>
      </div>

      {failed.length > 0 && !loading && rows.length > 0 && <p role="status" className="rounded-control bg-warning-soft px-3 py-2 text-[13px] text-warning">{t('all.partError')}</p>}

      <DataTable
        columns={columns}
        data={shown}
        rowKey="key"
        loading={loading}
        error={failed.length === sources.length ? t('all.loadError') : undefined}
        onRetry={() => failed.forEach((s) => s.refetch())}
        onRowClick={(r) => navigate(r.href)}
        pageSize={20}
        emptyTitle={filtered ? t('all.emptyFilter') : t('all.empty')}
        emptyMessage={filtered ? t('all.emptyFilterBody') : undefined}
        caption={t('all.title')}
      />
    </div>
  )
}
