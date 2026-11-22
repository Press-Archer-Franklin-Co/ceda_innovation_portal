import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Plus, Search } from 'lucide-react'
import PageHeader from '../../components/ui/PageHeader'
import Button from '../../components/ui/Button'
import Tabs from '../../components/ui/Tabs'
import { InputControl } from '../../components/ui/Input'
import EmptyState from '../../components/ui/EmptyState'
import ErrorState from '../../components/ui/ErrorState'
import Skeleton from '../../components/ui/Skeleton'
import { useConfirm } from '../../components/ui/confirm'
import { useToast } from '../../components/ui/toast'
import FormCard from '../../components/forms/FormCard'
import CreateFormWizard from '../../components/forms/CreateFormWizard'
import { useT } from '../../i18n/context'
import { forms as formsApi } from '../../lib/api/formBuilder'
import { formKeys, useArchiveForm, useDuplicateForm } from '../../lib/queries/forms'
import { useTabParam } from '../../lib/useTabParam'

const TABS = [
  { key: 'all', label: 'forms.tabAll', status: undefined, count: 'all' },
  { key: 'live', label: 'forms.tabLive', status: 'live', count: 'live' },
  { key: 'draft', label: 'forms.tabDrafts', status: 'draft', count: 'draft' },
  { key: 'closed', label: 'forms.tabClosed', status: 'closed', count: 'closed' },
]

/** 3.4: every form, with the create card first. Counts follow the search, not the tab. */
export default function Forms() {
  const t = useT()
  const navigate = useNavigate()
  const confirm = useConfirm()
  const toast = useToast()
  const createRef = useRef(null)
  const [creating, setCreating] = useState(false)
  const [query, setQuery] = useState('')
  const [search, setSearch] = useState('')
  const [tab, setTab] = useTabParam(TABS)
  const duplicate = useDuplicateForm()
  const archive = useArchiveForm()

  useEffect(() => {
    const timer = setTimeout(() => setSearch(query.trim()), 300)
    return () => clearTimeout(timer)
  }, [query])

  useEffect(() => {
    document.title = `${t('forms.title')} · CEDA Innovation`
  }, [t])

  const status = TABS.find((x) => x.key === tab)?.status
  const params = { ...(status ? { status } : {}), ...(search ? { search } : {}) }
  const list = useQuery({
    queryKey: formKeys.list(params),
    queryFn: async () => {
      const data = await formsApi.list(params)
      return Array.isArray(data) ? { results: data, counts: null } : { results: data?.results ?? [], counts: data?.counts ?? null }
    },
    placeholderData: keepPreviousData,
  })

  const counts = list.data?.counts
  const results = (list.data?.results ?? []).filter((form) => form.status !== 'archived' && !form.is_template)

  async function exportCsv(form) {
    try {
      const blob = await formsApi.exportCsv(form.id)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${form.code || form.id}-answers.csv`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      toast.show({ tone: 'error', title: err?.message || t('common.somethingWrong') })
    }
  }

  async function archiveForm(form) {
    const ok = await confirm({
      title: t('forms.archiveTitle', { name: form.name }),
      body: t('forms.archiveBody'),
      confirmLabel: t('forms.archive'),
    })
    if (!ok) return
    try {
      await archive.mutateAsync(form.id)
      toast.show({ tone: 'success', title: t('forms.archived', { name: form.name }) })
    } catch (err) {
      toast.show({ tone: 'error', title: err?.message || t('common.somethingWrong') })
    }
  }

  async function duplicateForm(form) {
    try {
      const copy = await duplicate.mutateAsync(form.id)
      toast.show({ tone: 'success', title: t('forms.duplicated', { name: copy?.name ?? form.name }) })
    } catch (err) {
      toast.show({ tone: 'error', title: err?.message || t('common.somethingWrong') })
    }
  }

  const actionsFor = (form) => [
    { key: 'open', label: t('forms.open'), onSelect: () => navigate(`/forms/${form.id}`) },
    { key: 'copy', label: t('forms.duplicate'), onSelect: () => duplicateForm(form) },
    { key: 'export', label: t('forms.export'), onSelect: () => exportCsv(form), hidden: !form.answer_count },
    { key: 'archive', label: t('forms.archive'), onSelect: () => archiveForm(form), danger: true },
  ]

  return (
    <div className="flex flex-col gap-[14px] 2xl:gap-[22px]">
      <PageHeader
        back={<Link to="/programs" className="text-[12px] text-muted hover:text-text hover:underline">{t('forms.crumb')}</Link>}
        title={t('forms.title')}
        subtitle={t('forms.subtitle')}
        actions={
          <Button ref={createRef} data-guide="forms.create" onClick={() => setCreating(true)}>
            <Plus size={16} aria-hidden />
            {t('forms.create')}
          </Button>
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs
          tabs={TABS.map((x) => ({ key: x.key, label: t(x.label), count: counts?.[x.count] }))}
          active={tab}
          onChange={setTab}
          variant="segment"
          label={t('forms.title')}
          idPrefix="forms"
        />
        <div className="w-full sm:w-[260px]">
          <InputControl
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('forms.search')}
            aria-label={t('forms.search')}
            leading={<Search size={16} aria-hidden />}
          />
        </div>
      </div>

      {list.isError ? (
        <ErrorState title={t('forms.loadError')} message={list.error?.message} onRetry={list.refetch} framed />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" aria-busy={list.isFetching || undefined}>
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="flex min-h-[220px] flex-col items-center justify-center gap-2 rounded-card border-2 border-dashed border-border bg-surface p-4 text-center hover:bg-surface2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary-soft text-primary">
              <Plus size={22} aria-hidden />
            </span>
            <span className="text-[14px] font-bold text-text">{t('forms.createCard')}</span>
            <span className="text-[12px] text-muted">{t('forms.createCardBody')}</span>
          </button>
          {list.isLoading
            ? [0, 1, 2].map((i) => <Skeleton key={i} className="h-[220px] rounded-card" />)
            : results.map((form) => <FormCard key={form.id} form={form} actions={actionsFor(form)} />)}
        </div>
      )}

      {!list.isLoading && !list.isError && results.length === 0 && (
        <EmptyState title={search ? t('forms.emptySearch', { query: search }) : t('forms.empty')} compact />
      )}

      <CreateFormWizard open={creating} onClose={() => setCreating(false)} triggerRef={createRef} />
    </div>
  )
}
