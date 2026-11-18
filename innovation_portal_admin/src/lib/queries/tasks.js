import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { assignments as api, evaluations as evalApi } from '../api/endpoints'
import { qk } from './keys'


export function useMyAssignments(params) {
  return useQuery({
    queryKey: qk.tasks(params),
    queryFn:  () => api.list(params),
    staleTime: 30_000,
  })
}

export function useMyEvaluationAssignments(params) {
  return useQuery({
    queryKey: qk.myEvaluations(params),
    queryFn:  () => evalApi.myAssigned(params),
    staleTime: 30_000,
    retry: 1,
  })
}

export function useAssignment(id) {
  return useQuery({
    queryKey: qk.task(id),
    queryFn:  () => api.get(id),
    enabled:  !!id,
  })
}

export function useAcceptAssignment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id) => api.accept(id),
    onSuccess:  () => {
      qc.invalidateQueries({ queryKey: ['tasks'] })
    },
  })
}

export function useDeclineAssignment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id) => api.decline(id),
    onSuccess:  () => {
      qc.invalidateQueries({ queryKey: ['tasks'] })
    },
  })
}

export function useCompleteAssignment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, body }) => api.complete(id, body),
    onSuccess:  (_, { id }) => {
      qc.invalidateQueries({ queryKey: qk.task(id) })
      qc.invalidateQueries({ queryKey: ['tasks'] })
    },
  })
}
