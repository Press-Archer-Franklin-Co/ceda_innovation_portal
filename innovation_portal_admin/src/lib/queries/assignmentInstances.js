import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { assignments, workflowInstances } from '../api/endpoints'

function mapStatus(status) {
  if (status === 'assigned') return 'pending'
  if (status === 'reassigned') return 'cancelled'
  return status
}

function normalizeAssignment(item) {
  if (!item) return item
  return {
    ...item,
    status: mapStatus(item.status),
    assignee_name: item.assignee_name,
    node_code: item.workflow_step_code,
    node_name: item.workflow_step_name,
    submission_id: item.submission,
    submission_title: item.submission_title,
    submission_reference_number: item.submission_reference_number,
  }
}

export const assignmentKeys = {
  all: () => ['assignments'],
  list: (p) => ['assignments', 'list', p],
  detail: (id) => ['assignments', 'detail', id],
  reviewerQueue: (p) => ['assignments', 'reviewer-queue', p],
}

export const workflowInstanceKeys = {
  detail: (id) => ['workflow-instances', 'detail', id],
  history: (id) => ['workflow-instances', 'history', id],
}

export function useMyAssignmentInstances(params = {}) {
  return useQuery({
    queryKey: assignmentKeys.list(params),
    queryFn: () => assignments.list(params),
    staleTime: 0,
    select: (data) => {
      const items = Array.isArray(data) ? data : (data?.results ?? [])
      return items.map(normalizeAssignment)
    },
  })
}

export function useAssignmentInstance(id) {
  return useQuery({
    queryKey: assignmentKeys.detail(id),
    queryFn: async () => normalizeAssignment(await assignments.get(id)),
    staleTime: 0,
    enabled: !!id,
  })
}

export function useReviewerQueue(params = {}, options = {}) {
  return useQuery({
    queryKey: assignmentKeys.reviewerQueue(params),
    queryFn: () => assignments.reviewerQueue(params),
    staleTime: 0,
    select: (data) => {
      const items = Array.isArray(data) ? data : (data?.results ?? [])
      return items
    },
    ...options,
  })
}

export function useWorkflowInstance(id) {
  return useQuery({
    queryKey: workflowInstanceKeys.detail(id),
    queryFn: () => workflowInstances.get(id),
    staleTime: 0,
    enabled: !!id,
  })
}

export function useWorkflowInstanceHistory(id) {
  return useQuery({
    queryKey: workflowInstanceKeys.history(id),
    queryFn: () => workflowInstances.history(id),
    staleTime: 0,
    enabled: !!id,
    select: (d) => Array.isArray(d) ? d : (d?.results ?? []),
  })
}

export function useClaimAssignment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id) => assignments.accept(id),
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: assignmentKeys.all() })
      qc.invalidateQueries({ queryKey: assignmentKeys.detail(id) })
    },
  })
}

export function useClaimSubmissionSlot() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (submissionId) => assignments.claimSubmission(submissionId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: assignmentKeys.all() })
    },
  })
}

export function useAcceptAssignment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id) => assignments.accept(id),
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: assignmentKeys.all() })
      qc.invalidateQueries({ queryKey: assignmentKeys.detail(id) })
    },
  })
}

export function useCompleteAssignment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }) => assignments.complete(id, body),
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: assignmentKeys.all() })
      qc.invalidateQueries({ queryKey: assignmentKeys.detail(id) })
    },
  })
}

export function useDeclineAssignment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }) => assignments.decline(id, body),
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: assignmentKeys.all() })
      qc.invalidateQueries({ queryKey: assignmentKeys.detail(id) })
    },
  })
}
