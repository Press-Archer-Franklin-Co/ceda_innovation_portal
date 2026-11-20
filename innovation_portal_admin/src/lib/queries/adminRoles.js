import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { adminRoles } from '../api/adminRoles'

export const roleKeys = {
  catalogue: ()   => ['admin', 'capabilities'],
  roles:     ()   => ['admin', 'roles'],
  roleCaps:  (id) => ['admin', 'roles', id, 'capabilities'],
  flow:      ()   => ['admin', 'approval-flow', 'content'],
}

const rows = (data) => (Array.isArray(data) ? data : data?.results ?? [])

export function useCapabilityCatalogue() {
  return useQuery({ queryKey: roleKeys.catalogue(), queryFn: () => adminRoles.catalogue(), staleTime: 30 * 60 * 1000 })
}

/** Roles with their capabilities. `retry: false` so a 403 (no settings.manage) shows at once. */
export function useAdminRoles({ enabled = true } = {}) {
  return useQuery({ queryKey: roleKeys.roles(), queryFn: async () => rows(await adminRoles.list()), enabled, retry: false })
}

/** Lock details for every role, so locked boxes show disabled with their reason. */
export function useRoleLocks(roles) {
  return useQueries({
    queries: (roles ?? []).map((r) => ({ queryKey: roleKeys.roleCaps(String(r.id)), queryFn: () => adminRoles.capabilities(r.id), staleTime: 5 * 60 * 1000 })),
  })
}

export function useRoleAction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ action, id, value }) => {
      if (action === 'create') return adminRoles.create(value)
      if (action === 'update') return adminRoles.update(id, value)
      if (action === 'remove') return adminRoles.remove(id)
      if (action === 'capabilities') return adminRoles.setCapabilities(id, value)
      throw new Error(`Unknown action ${action}`)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'roles'] }),
  })
}

export function useApprovalFlow() {
  return useQuery({ queryKey: roleKeys.flow(), queryFn: () => adminRoles.flow() })
}

export function useSaveApprovalFlow() {
  const qc = useQueryClient()
  return useMutation({ mutationFn: (body) => adminRoles.saveFlow(body), onSuccess: (data) => qc.setQueryData(roleKeys.flow(), data) })
}
