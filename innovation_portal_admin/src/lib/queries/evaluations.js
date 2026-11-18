import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { evaluations as api } from '../api/endpoints'
import { qk } from './keys'


export function useMarkingCriteriaList(params) {
  return useQuery({
    queryKey: ['evaluations', 'marking-criteria', params ?? {}],
    queryFn:  () => api.listMarkingCriteria(params),
    staleTime: 30_000,
  })
}

export function useMarkingCriteria(id) {
  return useQuery({
    queryKey: ['evaluations', 'marking-criteria', id],
    queryFn:  () => api.getMarkingCriteria(id),
    enabled:  !!id,
  })
}

export function useCreateMarkingCriteria() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body) => api.createMarkingCriteria(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['evaluations', 'marking-criteria'] })
    },
  })
}

export function useUpdateMarkingCriteria() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, body }) => api.updateMarkingCriteria(id, body),
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: ['evaluations', 'marking-criteria', id] })
      qc.invalidateQueries({ queryKey: ['evaluations', 'marking-criteria'] })
    },
  })
}

export function useDeleteMarkingCriteria() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id) => api.deleteMarkingCriteria(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['evaluations', 'marking-criteria'] })
    },
  })
}

export function useAddMarkingCriteriaItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ criteriaId, body }) => api.addMarkingCriteriaItem(criteriaId, body),
    onSuccess: (_, { criteriaId }) => {
      qc.invalidateQueries({ queryKey: ['evaluations', 'marking-criteria', criteriaId] })
      qc.invalidateQueries({ queryKey: ['evaluations', 'marking-criteria'] })
    },
  })
}

export function useUpdateMarkingCriteriaItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ criteriaId, itemId, body }) => api.updateMarkingCriteriaItem(criteriaId, itemId, body),
    onSuccess: (_, { criteriaId }) => {
      qc.invalidateQueries({ queryKey: ['evaluations', 'marking-criteria', criteriaId] })
    },
  })
}

export function useDeleteMarkingCriteriaItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ criteriaId, itemId }) => api.deleteMarkingCriteriaItem(criteriaId, itemId),
    onSuccess: (_, { criteriaId }) => {
      qc.invalidateQueries({ queryKey: ['evaluations', 'marking-criteria', criteriaId] })
      qc.invalidateQueries({ queryKey: ['evaluations', 'marking-criteria'] })
    },
  })
}

export function useSubmissionFeedback(subId) {
  return useQuery({
    queryKey: ['evaluations', 'feedback', subId],
    queryFn:  () => api.submissionFeedback(subId),
    enabled:  !!subId,
  })
}

export function useMyAssignedEvaluations(params) {
  const { enabled = true, ...queryParams } = params ?? {}
  return useQuery({
    queryKey: qk.myEvaluations(queryParams),
    queryFn:  () => api.myAssigned(queryParams),
    staleTime: 30_000,
    retry: 1,
    enabled,
  })
}

export function usePendingEvaluations(params) {
  return useQuery({
    queryKey: ['evaluations', 'pending', params ?? {}],
    queryFn:  () => api.pending(params),
    staleTime: 30_000,
    retry: 1,
  })
}

export function useSubmissionEvaluations(submissionId) {
  return useQuery({
    queryKey: ['evaluations', 'submission', submissionId],
    queryFn:  () => api.summary(submissionId),
    enabled:  !!submissionId,
  })
}

export function useEvaluationRubric(submissionId) {
  return useQuery({
    queryKey: ['evaluations', 'rubric', submissionId],
    queryFn: () => api.rubric(submissionId),
    enabled: !!submissionId,
  })
}

export function useEvaluationScores(submissionId) {
  return useQuery({
    queryKey: ['evaluations', 'scores', submissionId],
    queryFn: () => api.summary(submissionId),
    enabled: !!submissionId,
  })
}

export function useSaveEvaluation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ subId, body }) => api.save(subId, body),
    onSuccess: (_, { subId }) => {
      qc.invalidateQueries({ queryKey: ['evaluations', 'scores', subId] })
      qc.invalidateQueries({ queryKey: ['evaluations', 'submission', subId] })
      qc.invalidateQueries({ queryKey: ['submissions', subId, 'evaluations'] })
    },
  })
}

export function useSubmitEvaluation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ subId, body }) => api.submit(subId, body),
    onSuccess:  (_, { subId }) => {
      qc.invalidateQueries({ queryKey: ['evaluations'] })
      qc.invalidateQueries({ queryKey: ['submissions', subId] })
      qc.invalidateQueries({ queryKey: ['submissions', subId, 'evaluations'] })
    },
  })
}


export function useMyCycle(submissionId) {
  return useQuery({
    queryKey: ['evaluations', 'cycle', submissionId],
    queryFn:  () => api.myCycle(submissionId),
    enabled:  !!submissionId,
    staleTime: 15_000,
  })
}

export function useSaveCycleScores() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ subId, scores, overall_comment }) =>
      api.saveCycleScores(subId, { scores, overall_comment }),
    onSuccess: (_, { subId }) => {
      qc.invalidateQueries({ queryKey: ['evaluations', 'cycle', subId] })
    },
  })
}

export function useSubmitCycle() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ subId, scores, overall_comment }) =>
      api.submitCycle(subId, scores ? { scores, overall_comment } : undefined),
    onSuccess: (_, { subId }) => {
      qc.invalidateQueries({ queryKey: ['evaluations', 'cycle', subId] })
      qc.invalidateQueries({ queryKey: ['evaluations', 'cycles', subId] })
      qc.invalidateQueries({ queryKey: ['submissions', subId] })
    },
  })
}

export function useReviewCycles(submissionId) {
  return useQuery({
    queryKey: ['evaluations', 'cycles', submissionId],
    queryFn:  () => api.listCycles(submissionId),
    enabled:  !!submissionId,
  })
}

export function useCycleSummary(submissionId, cycleId) {
  return useQuery({
    queryKey: ['evaluations', 'cycle-summary', submissionId, cycleId],
    queryFn:  () => api.cycleSummary(submissionId, cycleId),
    enabled:  !!submissionId && !!cycleId,
  })
}

export function useStageConfig(stepId) {
  return useQuery({
    queryKey: ['evaluations', 'stage-config', stepId],
    queryFn:  () => api.getStageConfig(stepId),
    enabled:  !!stepId,
  })
}

export function useSetStageConfig() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ stepId, body }) => api.setStageConfig(stepId, body),
    onSuccess: (_, { stepId }) => {
      qc.invalidateQueries({ queryKey: ['evaluations', 'stage-config', stepId] })
    },
  })
}

export function useAddCriterion() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ stepId, body }) => api.addCriterion(stepId, body),
    onSuccess: (_, { stepId }) => {
      qc.invalidateQueries({ queryKey: ['evaluations', 'stage-config', stepId] })
    },
  })
}

export function useUpdateCriterion() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ stepId, crId, body }) => api.updateCriterion(stepId, crId, body),
    onSuccess: (_, { stepId }) => {
      qc.invalidateQueries({ queryKey: ['evaluations', 'stage-config', stepId] })
    },
  })
}

export function useDeleteCriterion() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ stepId, crId }) => api.deleteCriterion(stepId, crId),
    onSuccess: (_, { stepId }) => {
      qc.invalidateQueries({ queryKey: ['evaluations', 'stage-config', stepId] })
    },
  })
}
