import { useQuery } from '@tanstack/react-query'
import { analytics as api, reports } from '../api/endpoints'

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
