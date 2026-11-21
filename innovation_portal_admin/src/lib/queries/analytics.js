import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { analytics as api, reports, reference } from '../api/endpoints'

export function useAnalyticsBottlenecks() {
  return useQuery({
    queryKey: ['analytics', 'bottlenecks'],
    queryFn:  () => api.bottlenecks(),
    staleTime: 120_000,
    retry: 1,
  })
}

export function useReviewerPerformance() {
  return useQuery({
    queryKey: ['analytics', 'reviewer-performance'],
    queryFn:  () => api.reviewerPerformance(),
    staleTime: 120_000,
    retry: 1,
  })
}

export function useReportsDashboard(params) {
  return useQuery({
    queryKey: ['reports', 'dashboard', params ?? {}],
    queryFn:  () => reports.dashboard(params),
    staleTime: 60_000,
  })
}

export function useFormResponseAnalytics(programId, params, options = {}) {
  return useQuery({
    queryKey: ['analytics', 'form-responses', programId, params ?? {}],
    queryFn:  () => api.formResponses(programId, params),
    enabled:  !!programId && (options.enabled ?? true),
    staleTime: 60_000,
  })
}

// --- B7 dashboard and reports (U4, R-35) --------------------------------------------------
// Keys start with ['analytics', 'b7'] so one invalidation refreshes every card. The API caches for 5 minutes.
export const b7Keys = {
  all:    () => ['analytics', 'b7'],
  report: (name, filters, extra) => ['analytics', 'b7', name, filters ?? {}, ...(extra ? [extra] : [])],
}

const b7 = (name, fetch, filters, { enabled = true, extra } = {}) => ({
  queryKey: b7Keys.report(name, filters, extra),
  queryFn: () => fetch(filters),
  enabled,
  staleTime: 60_000,
  retry: 1,
  // Keep the old numbers on screen while a filter change loads (ceda-ui section 7).
  placeholderData: keepPreviousData,
})

export const useKpis      = (filters, opts) => useQuery(b7('kpis', api.kpis, filters, opts))
export const usePipeline  = (filters, opts) => useQuery(b7('pipeline', api.pipeline, filters, opts))
export const useFunnel    = (filters, opts) => useQuery(b7('funnel', api.funnel, filters, opts))
export const useSources   = (filters, opts) => useQuery(b7('sources', api.sources, filters, opts))
export const useSectors   = (filters, opts) => useQuery(b7('sectors', api.sectors, filters, opts))
export const useInclusion = (filters, opts) => useQuery(b7('inclusion', api.inclusion, filters, opts))
export const useSeries    = (filters, interval, opts) =>
  useQuery(b7('series', (f) => api.series(f, interval), filters, { ...opts, extra: interval }))

const list = (data) => (Array.isArray(data) ? data : data?.results ?? [])

/** Sectors and districts for the filter row. They change rarely. */
export function useReferenceList(kind, lang) {
  return useQuery({
    queryKey: ['reference', kind, lang],
    queryFn: async () => list(await reference[kind](lang)),
    staleTime: 30 * 60 * 1000,
  })
}
