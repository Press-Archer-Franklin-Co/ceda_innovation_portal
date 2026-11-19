import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Search } from 'lucide-react'
import { useT } from '../../i18n/context'
import DataTable from './DataTable'

/**
 * A table whose rows the server pages, sorts and searches (submissions, users, audit log).
 * Never fetch everything and sort in the browser. ceda-ui section 4 and 11.
 *
 *   <ServerTable
 *     queryKey={(params) => ['submissions', params]}
 *     fetcher={(params) => submissions.list(params)}   // gets { page, page_size, ordering?, search? }
 *     columns={columns} onRowClick={...} emptyTitle="No ideas yet" />
 *
 * The fetcher may return DRF's { count, results } or a plain array. Page, ordering and search live in
 * the URL (?page=&ordering=&search=), so back, reload and shared links keep them. Old rows stay on
 * screen while the next page loads (keepPreviousData). `filters` are added to every request.
 */
export default function ServerTable({ queryKey, fetcher, filters = {}, pageSize = 25, searchable = true, searchLabel, toolbar, urlState = true, ...tableProps }) {
  const t = useT()
  const [params, setParams] = useSearchParams()
  const [local, setLocal] = useState({ page: 1, ordering: '', search: '' })
  const state = urlState
    ? { page: Number(params.get('page')) || 1, ordering: params.get('ordering') ?? '', search: params.get('search') ?? '' }
    : local
  const update = (patch) => {
    if (!urlState) { setLocal((s) => ({ ...s, ...patch })); return }
    setParams((p) => {
      const next = new URLSearchParams(p)
      for (const [k, v] of Object.entries(patch)) {
        if (v === '' || v === null || v === undefined || (k === 'page' && v === 1)) next.delete(k)
        else next.set(k, String(v))
      }
      return next
    }, { replace: true })
  }

  const [draft, setDraft] = useState(state.search)
  useEffect(() => { setDraft(state.search) }, [state.search])
  useEffect(() => {
    if (draft === state.search) return
    const id = setTimeout(() => update({ search: draft, page: 1 }), 300)
    return () => clearTimeout(id)
  }) // re-arms on each keystroke; update() is recreated each render on purpose

  const request = {
    ...filters,
    page: state.page,
    page_size: pageSize,
    ...(state.ordering ? { ordering: state.ordering } : {}),
    ...(state.search ? { search: state.search } : {}),
  }
  const query = useQuery({ queryKey: queryKey(request), queryFn: () => fetcher(request), placeholderData: keepPreviousData })
  const data = query.data
  const rows = Array.isArray(data) ? data : data?.results ?? []
  const total = Array.isArray(data) ? rows.length : data?.count ?? rows.length
  const sort = state.ordering ? { key: state.ordering.replace(/^-/, ''), dir: state.ordering.startsWith('-') ? 'desc' : 'asc' } : { key: null, dir: 'asc' }

  return (
    <DataTable
      {...tableProps}
      data={rows}
      loading={query.isLoading}
      error={query.isError ? query.error : null}
      onRetry={() => query.refetch()}
      retrying={query.isFetching && query.isError}
      sort={sort}
      onSortChange={(s) => update({ ordering: s.dir === 'desc' ? `-${s.key}` : s.key, page: 1 })}
      page={state.page}
      pageSize={pageSize}
      total={total}
      onPageChange={(p) => update({ page: p })}
      toolbar={
        searchable || toolbar ? (
          <>
            {searchable && (
              <div className="relative w-full sm:w-[280px]">
                <Search size={14} aria-hidden className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
                <input
                  type="search"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder={searchLabel ?? t('table.search')}
                  aria-label={searchLabel ?? t('table.search')}
                  className="input pl-8 h-8 min-h-0"
                />
              </div>
            )}
            {toolbar && <div className="flex flex-wrap items-center gap-2 sm:ml-auto">{toolbar}</div>}
          </>
        ) : null
      }
    />
  )
}
