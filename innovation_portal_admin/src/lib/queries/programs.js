import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { programs as api, submissions as subApi, termsAndConditions as tcApi } from '../api/endpoints'
import { qk } from './keys'

export function useProgramTypes() {
  return useQuery({
    queryKey: ['program-types'],
    queryFn:  () => api.types(),
    staleTime: 5 * 60 * 1000,
  })
}

export function usePrograms(params) {
  return useQuery({
    queryKey: qk.programs(params),
    queryFn:  () => api.list(params),
  })
}

export function useProgram(id) {
  return useQuery({
    queryKey: qk.program(id),
    queryFn:  () => api.get(id),
    enabled:  !!id,
  })
}

export function useProgramStages(id) {
  return useQuery({
    queryKey: ['programs', id, 'stages'],
    queryFn:  () => api.stages(id),
    enabled:  !!id,
  })
}

export function useProgramFormSections(id) {
  return useQuery({
    queryKey: ['programs', id, 'form-sections'],
    queryFn:  () => api.form(id),
    enabled:  !!id,
  })
}

export function useProgramForm(id) {
  return useQuery({
    queryKey: ['programs', id, 'form'],
    queryFn: () => api.form(id),
    enabled: !!id,
    retry: false,
  })
}

export function useProgramSubmissions(programId, params) {
  return useQuery({
    queryKey: qk.submissions({ program: programId, ...params }),
    queryFn:  () => subApi.list({ ...params, program: programId }),
    enabled:  !!programId,
  })
}

export function useCreateProgram() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body) => api.create(body),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: qk.programs() })
      if (result?.id) qc.invalidateQueries({ queryKey: qk.program(result.id) })
    },
  })
}

export function useUpdateProgram() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }) => api.update(id, body),
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: qk.programs() })
      qc.invalidateQueries({ queryKey: qk.program(id) })
    },
  })
}

export function useCreateFormSection(programId) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ programId: bodyProgramId, ...body }) => api.createFormSection(bodyProgramId || programId, body),
    onSuccess: (_, vars) => {
      const targetProgramId = vars.programId || programId
      qc.invalidateQueries({ queryKey: ['programs', targetProgramId, 'form'] })
      qc.invalidateQueries({ queryKey: qk.program(targetProgramId) })
    },
  })
}

export function useUpdateFormSection(programId) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, programId: bodyProgramId, ...body }) => api.updateFormSection(id, body),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['programs', vars.programId || programId, 'form'] })
    },
  })
}

export function useDeleteFormSection(programId) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (idOrVars) => api.deleteFormSection(typeof idOrVars === 'object' ? idOrVars.id : idOrVars),
    onSuccess: (_, vars) => {
      const targetProgramId = vars?.programId || programId
      qc.invalidateQueries({ queryKey: ['programs', targetProgramId, 'form'] })
    },
  })
}

export function useCreateFormField(programId) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ sectionId, programId: bodyProgramId, ...body }) => api.createField(sectionId, body),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['programs', vars.programId || programId, 'form'] })
    },
  })
}

export function useUpdateFormField(programId) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, programId: bodyProgramId, ...body }) => api.updateField(id, body),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['programs', vars.programId || programId, 'form'] })
    },
  })
}

export function useDeleteFormField(programId) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (idOrVars) => api.deleteField(typeof idOrVars === 'object' ? idOrVars.id : idOrVars),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['programs', vars?.programId || programId, 'form'] })
    },
  })
}

export function useCreateFieldOption(programId) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ fieldId, programId: bodyProgramId, ...body }) => api.createFieldOption(fieldId, body),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['programs', vars.programId || programId, 'form'] })
    },
  })
}

export function useUpdateFieldOption(programId) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, programId: bodyProgramId, ...body }) => api.updateFieldOption(id, body),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['programs', vars.programId || programId, 'form'] })
    },
  })
}

export function useDeleteFieldOption(programId) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (idOrVars) => api.deleteFieldOption(typeof idOrVars === 'object' ? idOrVars.id : idOrVars),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['programs', vars?.programId || programId, 'form'] })
    },
  })
}

export function usePublishProgram() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id) => api.publish(id),
    onSuccess:  (_, id) => {
      qc.invalidateQueries({ queryKey: qk.programs() })
      qc.invalidateQueries({ queryKey: qk.program(id) })
    },
  })
}

export function useCloseProgram() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id) => api.close(id),
    onSuccess:  (_, id) => {
      qc.invalidateQueries({ queryKey: qk.programs() })
      qc.invalidateQueries({ queryKey: qk.program(id) })
    },
  })
}


export function useTermsAndConditionsList() {
  return useQuery({
    queryKey: ['terms-and-conditions'],
    queryFn: () => tcApi.list(),
  })
}

export function useCreateTermsAndConditions() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body) => tcApi.create(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['terms-and-conditions'] }),
  })
}

export function useUpdateTermsAndConditions() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, body }) => tcApi.update(id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['terms-and-conditions'] }),
  })
}

export function useDeleteTermsAndConditions() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id) => tcApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['terms-and-conditions'] }),
  })
}
