import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { channelsApi as api } from '../api/channels'
import { useAuth } from '../auth/AuthContext'

// Hierarchical keys: invalidating ['channels'] refreshes everything below it.
export const channelKeys = {
  all:         ['channels'],
  status:      ['channels', 'status'],
  nodeTypes:   ['channels', 'node-types'],
  providers:   ['channels', 'providers'],
  journeys:    (params) => ['channels', 'journeys', params ?? {}],
  journey:     (id) => ['channels', 'journey', id],
  versions:    (id) => ['channels', 'journey', id, 'versions'],
  connections: (params) => ['channels', 'connections', params ?? {}],
  sessions:    (params) => ['channels', 'sessions', params ?? {}],
  session:     (id) => ['channels', 'session', id],
  report:      (params) => ['channels', 'report', params ?? {}],
}

function useCan() {
  const { can } = useAuth()
  return can('channels.manage')
}

function useInvalidate(key = channelKeys.all) {
  const qc = useQueryClient()
  return () => qc.invalidateQueries({ queryKey: key })
}

export function useChannelStatus() {
  const enabled = useCan()
  return useQuery({ queryKey: channelKeys.status, queryFn: () => api.status(), enabled })
}

export function useNodeTypes() {
  const enabled = useCan()
  return useQuery({ queryKey: channelKeys.nodeTypes, queryFn: () => api.nodeTypes(), enabled, staleTime: 60 * 60 * 1000 })
}

export function useChannelProviders() {
  const enabled = useCan()
  return useQuery({ queryKey: channelKeys.providers, queryFn: () => api.providers(), enabled, staleTime: 10 * 60 * 1000 })
}

export function useJourneys(params) {
  const enabled = useCan()
  return useQuery({ queryKey: channelKeys.journeys(params), queryFn: () => api.journeys(params), enabled })
}

export function useJourney(id) {
  const enabled = useCan() && !!id
  return useQuery({ queryKey: channelKeys.journey(id), queryFn: () => api.journey(id), enabled })
}

export function useJourneyVersions(id) {
  const enabled = useCan() && !!id
  return useQuery({ queryKey: channelKeys.versions(id), queryFn: () => api.versions(id), enabled })
}

export function useCreateJourney() {
  const invalidate = useInvalidate()
  return useMutation({ mutationFn: (body) => api.createJourney(body), onSuccess: invalidate })
}

export function useUpdateJourney() {
  const invalidate = useInvalidate()
  return useMutation({ mutationFn: ({ id, body }) => api.updateJourney(id, body), onSuccess: invalidate })
}

export function useDeleteJourney() {
  const invalidate = useInvalidate()
  return useMutation({ mutationFn: (id) => api.deleteJourney(id), onSuccess: invalidate })
}

export function useSaveNodes() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, body }) => api.saveNodes(id, body),
    onSuccess: (journey, { id }) => {
      qc.setQueryData(channelKeys.journey(id), journey)
      qc.invalidateQueries({ queryKey: ['channels', 'journeys'] })
    },
  })
}

export function useValidateJourney() {
  return useMutation({ mutationFn: (id) => api.validate(id) })
}

export function usePublishJourney() {
  const invalidate = useInvalidate()
  return useMutation({ mutationFn: (id) => api.publish(id), onSuccess: invalidate })
}

export function useChannelConnections(params) {
  const enabled = useCan()
  return useQuery({ queryKey: channelKeys.connections(params), queryFn: () => api.connections(params), enabled })
}

function connectionMutation(fn) {
  return function useIt() {
    const invalidate = useInvalidate()
    return useMutation({ mutationFn: fn, onSuccess: invalidate })
  }
}

export const useCreateConnection = connectionMutation((body) => api.createConnection(body))
export const useUpdateConnection = connectionMutation(({ id, body }) => api.updateConnection(id, body))
export const useDeleteConnection = connectionMutation((id) => api.deleteConnection(id))
export const useTestConnection = connectionMutation(({ id, body }) => api.testConnection(id, body))
export const useActivateConnection = connectionMutation((id) => api.activate(id))
export const useDeactivateConnection = connectionMutation((id) => api.deactivate(id))
export const useRotateWebhook = connectionMutation((id) => api.rotateWebhook(id))

export function useChannelSessions(params) {
  const enabled = useCan()
  return useQuery({ queryKey: channelKeys.sessions(params), queryFn: () => api.sessions(params), enabled, placeholderData: keepPreviousData })
}

export function useChannelSession(id) {
  const enabled = useCan() && !!id
  return useQuery({ queryKey: channelKeys.session(id), queryFn: () => api.session(id), enabled })
}

export function useChannelReport(params) {
  const enabled = useCan()
  return useQuery({ queryKey: channelKeys.report(params), queryFn: () => api.report(params), enabled, placeholderData: keepPreviousData })
}

export function useSimulate() {
  return useMutation({ mutationFn: (body) => api.simulate(body) })
}
