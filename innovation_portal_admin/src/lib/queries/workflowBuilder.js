import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { pollEvery } from '../api/refusals'
import {
  workflows as wfApi,
  workflowSteps,
  workflowNodes,
  workflowTransitions,
  workflowNodeActions,
  assignmentPolicies as apApi,
  workflowInstances as wiApi,
  programs as programsApi,
} from '../api/endpoints'

export const wbKeys = {
  all:                ()     => ['workflow-definitions'],
  list:               (p)    => ['workflow-definitions', 'list', p ?? {}],
  detail:             (id)   => ['workflow-definitions', id],
  nodes:              (id)   => ['workflow-definitions', id, 'nodes'],
  steps:              (id)   => ['workflow-definitions', id, 'steps'],
  transitions:        (id)   => ['workflow-definitions', id, 'transitions'],
  assignmentPolicies: (p)    => ['assignment-policies', p ?? {}],
  forms:              (p)    => ['forms', p ?? {}],
  instance:           (id)   => ['workflow-instances', id],
  instanceHistory:    (id)   => ['workflow-instances', id, 'history'],
}

export function useWorkflowDefinitions(params) {
  return useQuery({
    queryKey: wbKeys.list(params),
    queryFn:  () => wfApi.list(params),
    staleTime: 30_000,
  })
}

export function useWorkflowDefinition(id) {
  return useQuery({
    queryKey: wbKeys.detail(id),
    queryFn:  () => wfApi.get(id),
    enabled:  !!id,
  })
}

export function useWorkflowNodes(id) {
  return useQuery({
    queryKey: wbKeys.nodes(id),
    queryFn:  () => wfApi.nodes(id),
    enabled:  !!id,
    staleTime: 0,
  })
}

export function useWorkflowTransitions(id) {
  return useQuery({
    queryKey: wbKeys.transitions(id),
    queryFn:  () => wfApi.transitions(id),
    enabled:  !!id,
    staleTime: 0,
  })
}

export function useWorkflowSteps(id) {
  return useQuery({
    queryKey: wbKeys.steps(id),
    queryFn: () => wfApi.steps(id),
    enabled: !!id,
    staleTime: 0,
  })
}

export function useForms(params) {
  const programId = params?.program
  return useQuery({
    queryKey: wbKeys.forms(params),
    queryFn:  async () => {
      if (!programId) return []
      const form = await programsApi.form(programId)
      return form ? [form] : []
    },
    enabled: !!programId,
    staleTime: 60_000,
  })
}

export function useAssignmentPolicies(params) {
  return useQuery({
    queryKey: wbKeys.assignmentPolicies(params),
    queryFn:  () => apApi.list(params),
    staleTime: 60_000,
  })
}

export function useCreateWorkflow() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body) => wfApi.create(body),
    onSuccess:  () => qc.invalidateQueries({ queryKey: wbKeys.all() }),
  })
}

export function useUpdateWorkflow() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }) => wfApi.update(id, body),
    onSuccess:  (_, { id }) => {
      qc.invalidateQueries({ queryKey: wbKeys.detail(id) })
      qc.invalidateQueries({ queryKey: wbKeys.all() })
    },
  })
}

export function useDeleteWorkflow() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id) => wfApi.delete(id),
    onSuccess:  () => qc.invalidateQueries({ queryKey: wbKeys.all() }),
  })
}

export function usePublishWorkflow() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id) => wfApi.publish(id),
    onSuccess:  (_, id) => {
      qc.invalidateQueries({ queryKey: wbKeys.detail(id) })
      qc.invalidateQueries({ queryKey: wbKeys.all() })
    },
  })
}

export function useActivateWorkflowDef() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id) => wfApi.activate(id),
    onSuccess:  (_, id) => {
      qc.invalidateQueries({ queryKey: wbKeys.detail(id) })
      qc.invalidateQueries({ queryKey: wbKeys.all() })
    },
  })
}

export function useArchiveWorkflow() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id) => wfApi.archive(id),
    onSuccess:  (_, id) => {
      qc.invalidateQueries({ queryKey: wbKeys.detail(id) })
      qc.invalidateQueries({ queryKey: wbKeys.all() })
    },
  })
}

export function useCloneWorkflow() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id) => wfApi.clone(id),
    onSuccess:  () => qc.invalidateQueries({ queryKey: wbKeys.all() }),
  })
}

export function useValidateWorkflow() {
  return useMutation({
    mutationFn: (id) => wfApi.validate(id),
  })
}

export function useCreateWorkflowStep(wfId) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body) => wfApi.createStep(wfId, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: wbKeys.steps(wfId) })
      qc.invalidateQueries({ queryKey: wbKeys.detail(wfId) })
    },
  })
}

export function useUpdateWorkflowStep(wfId) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }) => workflowSteps.update(id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: wbKeys.steps(wfId) })
      qc.invalidateQueries({ queryKey: wbKeys.detail(wfId) })
    },
  })
}

export function useDeleteWorkflowStep(wfId) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id) => workflowSteps.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: wbKeys.steps(wfId) })
      qc.invalidateQueries({ queryKey: wbKeys.detail(wfId) })
    },
  })
}

export function useCreateNode(wfId) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body) => wfApi.createNode(wfId, body),
    onSuccess:  () => qc.invalidateQueries({ queryKey: wbKeys.nodes(wfId) }),
  })
}

export function useUpdateNode(wfId) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }) => workflowNodes.update(id, body),
    onSuccess:  () => qc.invalidateQueries({ queryKey: wbKeys.nodes(wfId) }),
  })
}

export function useDeleteNode(wfId) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id) => workflowNodes.delete(id),
    onSuccess:  () => {
      qc.invalidateQueries({ queryKey: wbKeys.nodes(wfId) })
      qc.invalidateQueries({ queryKey: wbKeys.transitions(wfId) })
    },
  })
}

export function useBindForm(wfId) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ nodeId, ...body }) => workflowNodes.bindForm(nodeId, { node: nodeId, ...body }),
    onSuccess:  () => qc.invalidateQueries({ queryKey: wbKeys.nodes(wfId) }),
  })
}

export function useBindAssignmentPolicy(wfId) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ nodeId, ...body }) => workflowNodes.bindAssignmentPolicy(nodeId, { node: nodeId, ...body }),
    onSuccess:  () => qc.invalidateQueries({ queryKey: wbKeys.nodes(wfId) }),
  })
}

export function useCreateNodeAction(wfId) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ nodeId, ...body }) => workflowNodes.createAction(nodeId, { node: nodeId, ...body }),
    onSuccess:  () => qc.invalidateQueries({ queryKey: wbKeys.nodes(wfId) }),
  })
}

export function useUpdateNodeAction(wfId) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }) => workflowNodeActions.update(id, body),
    onSuccess:  () => qc.invalidateQueries({ queryKey: wbKeys.nodes(wfId) }),
  })
}

export function useDeleteNodeAction(wfId) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id) => workflowNodeActions.delete(id),
    onSuccess:  () => qc.invalidateQueries({ queryKey: wbKeys.nodes(wfId) }),
  })
}

export function useCreateTransition(wfId) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body) => wfApi.createTransition(wfId, body),
    onSuccess:  () => qc.invalidateQueries({ queryKey: wbKeys.transitions(wfId) }),
  })
}

export function useUpdateTransition(wfId) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }) => workflowTransitions.update(id, body),
    onSuccess:  () => qc.invalidateQueries({ queryKey: wbKeys.transitions(wfId) }),
  })
}

export function useDeleteTransition(wfId) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id) => workflowTransitions.delete(id),
    onSuccess:  () => qc.invalidateQueries({ queryKey: wbKeys.transitions(wfId) }),
  })
}


export function useWorkflowInstances(params) {
  return useQuery({
    queryKey: ['workflow-instances', 'list', params ?? {}],
    queryFn:  () => wiApi.list(params),
    enabled:  true,
    staleTime: 0,
    refetchInterval: pollEvery(15_000),
  })
}

export function useWorkflowInstance(id) {
  return useQuery({
    queryKey: wbKeys.instance(id),
    queryFn:  () => wiApi.get(id),
    enabled:  !!id,
    staleTime: 0,
    refetchInterval: pollEvery(10_000),
  })
}

export function useWorkflowInstanceHistory(id) {
  return useQuery({
    queryKey: wbKeys.instanceHistory(id),
    queryFn:  () => wiApi.history(id),
    enabled:  !!id,
  })
}

export function useCancelInstance() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id) => wiApi.cancel(id),
    onSuccess:  (_, id) => qc.invalidateQueries({ queryKey: wbKeys.instance(id) }),
  })
}

export function usePauseInstance() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id) => wiApi.pause(id),
    onSuccess:  (_, id) => qc.invalidateQueries({ queryKey: wbKeys.instance(id) }),
  })
}

export function useResumeInstance() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id) => wiApi.resume(id),
    onSuccess:  (_, id) => qc.invalidateQueries({ queryKey: wbKeys.instance(id) }),
  })
}
