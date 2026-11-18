import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { workflows as api } from '../api/endpoints'

export function useWorkflows(params) {
  return useQuery({
    queryKey: ['workflows', params ?? {}],
    queryFn:  () => api.list(params),
    staleTime: 60_000,
  })
}

export function useWorkflow(id) {
  return useQuery({
    queryKey: ['workflows', id],
    queryFn:  () => api.get(id),
    enabled:  !!id,
  })
}

export function useWorkflowSteps(id) {
  return useQuery({
    queryKey: ['workflows', id, 'steps'],
    queryFn:  () => api.steps(id),
    enabled:  !!id,
  })
}

export function useActivateWorkflow() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id) => api.activate(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workflows'] })
    },
  })
}
