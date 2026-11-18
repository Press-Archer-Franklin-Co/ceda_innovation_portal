import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { submissions as api } from '../api/endpoints'
import { qk } from './keys'

export function useSubmissions(params) {
  return useQuery({
    queryKey: qk.submissions(params),
    queryFn:  () => api.list(params),
  })
}

export function useSubmission(id) {
  return useQuery({
    queryKey: qk.submission(id),
    queryFn:  () => api.get(id),
    enabled:  !!id,
    refetchInterval: 30_000,
  })
}

export function useSubmissionWorkflow(id) {
  return useQuery({
    queryKey: qk.submissionTimeline(id),
    queryFn:  () => api.workflow(id),
    enabled:  !!id,
  })
}

export function useSubmissionNotes(id) {
  return useQuery({
    queryKey: qk.submissionNotes(id),
    queryFn:  () => api.notes(id),
    enabled:  !!id,
  })
}

export function useSubmissionHistory(id) {
  return useQuery({
    queryKey: ['submissions', id, 'history'],
    queryFn:  () => api.history(id),
    enabled:  !!id,
  })
}

export function useSubmissionEvaluations(id) {
  return useQuery({
    queryKey: ['submissions', id, 'evaluations'],
    queryFn:  () => api.evaluations(id),
    enabled:  !!id,
  })
}

export function useAddNote() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, body }) => api.addNote(id, body),
    onSuccess:  (_, { id }) => {
      qc.invalidateQueries({ queryKey: qk.submissionNotes(id) })
    },
  })
}

export function useWorkflowAction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, body }) => api.workflowAction(id, body),
    onSuccess:  (_, { id }) => {
      qc.invalidateQueries({ queryKey: qk.submission(id) })
      qc.invalidateQueries({ queryKey: qk.submissionTimeline(id) })
      qc.invalidateQueries({ queryKey: ['submissions'] })
    },
  })
}
