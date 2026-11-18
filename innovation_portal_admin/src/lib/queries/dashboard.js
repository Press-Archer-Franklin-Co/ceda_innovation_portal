import { useQuery } from '@tanstack/react-query'
import { operations, reports, evaluations, assignments, submissions } from '../api/endpoints'

export function useOperationsDashboard() {
  return useQuery({
    queryKey: ['operations', 'dashboard'],
    queryFn:  () => operations.dashboard(),
    staleTime: 60_000,
  })
}

export function useReportsDashboard(params) {
  return useQuery({
    queryKey: ['reports', 'dashboard', params ?? {}],
    queryFn:  () => reports.dashboard(params),
    staleTime: 60_000,
  })
}

export function useMyAssignedEvaluations(params) {
  return useQuery({
    queryKey: ['evaluations', 'my-assigned', params ?? {}],
    queryFn:  () => evaluations.myAssigned(params),
    staleTime: 30_000,
  })
}

export function useMyAssignments(params) {
  return useQuery({
    queryKey: ['assignments', params ?? {}],
    queryFn:  () => assignments.list(params),
    staleTime: 30_000,
  })
}

export function useRecentSubmissions(params) {
  return useQuery({
    queryKey: ['submissions', 'recent', params ?? {}],
    queryFn:  () => submissions.list(params),
    staleTime: 30_000,
  })
}
