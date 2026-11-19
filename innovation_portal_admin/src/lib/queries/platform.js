import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { platform as api } from '../api/endpoints'

export const platformKeys = {
  features:     ['platform', 'features'],
  providers:    (kind) => ['platform', 'providers', kind],
  runtime:      ['platform', 'runtime'],
  integrations: (kind) => ['platform', 'integrations', kind],
  integration:  (id)   => ['platform', 'integration', id],
  history:      (id)   => ['platform', 'integration', id, 'history'],
}

function useInvalidatePlatform() {
  const qc = useQueryClient()
  return () => qc.invalidateQueries({ queryKey: ['platform'] })
}

export function useFeatureFlags() {
  return useQuery({ queryKey: platformKeys.features, queryFn: () => api.features() })
}

export function useSetFeatureFlag() {
  const invalidate = useInvalidatePlatform()
  return useMutation({
    mutationFn: ({ key, enabled }) => api.setFeature(key, { enabled }),
    onSuccess: invalidate,
  })
}

export function useProviders(kind) {
  return useQuery({
    queryKey: platformKeys.providers(kind),
    queryFn:  () => api.providers(kind),
    staleTime: 10 * 60 * 1000,
  })
}

export function useRuntimeStatus() {
  return useQuery({ queryKey: platformKeys.runtime, queryFn: () => api.runtime() })
}

export function useIntegrations(kind) {
  return useQuery({ queryKey: platformKeys.integrations(kind), queryFn: () => api.integrations(kind) })
}

export function useIntegration(id, options = {}) {
  return useQuery({
    queryKey: platformKeys.integration(id),
    queryFn:  () => api.integration(id),
    enabled:  !!id,
    ...options,
  })
}

export function useIntegrationHistory(id) {
  return useQuery({ queryKey: platformKeys.history(id), queryFn: () => api.history(id), enabled: !!id })
}

export function useSaveIntegration() {
  const invalidate = useInvalidatePlatform()
  return useMutation({
    mutationFn: ({ id, body }) => (id ? api.updateIntegration(id, body) : api.createIntegration(body)),
    onSuccess: invalidate,
  })
}

export function useDeleteIntegration() {
  const invalidate = useInvalidatePlatform()
  return useMutation({ mutationFn: (id) => api.deleteIntegration(id), onSuccess: invalidate })
}

export function useTestIntegration() {
  const invalidate = useInvalidatePlatform()
  return useMutation({ mutationFn: ({ id, body }) => api.testIntegration(id, body), onSuccess: invalidate })
}

export function useActivateIntegration() {
  const invalidate = useInvalidatePlatform()
  return useMutation({ mutationFn: (id) => api.activate(id), onSuccess: invalidate })
}

export function useDeactivateIntegration() {
  const invalidate = useInvalidatePlatform()
  return useMutation({ mutationFn: (id) => api.deactivate(id), onSuccess: invalidate })
}

export function useStartSsoTrial() {
  return useMutation({ mutationFn: (id) => api.startSsoTrial(id) })
}
