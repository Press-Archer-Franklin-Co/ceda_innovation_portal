import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { forms as api, programSetup, programJudging } from '../api/formBuilder'

/** Query keys for the U5 screens. */
export const formKeys = {
  all:          ['forms'],
  list:         (params) => ['forms', 'list', params ?? {}],
  templates:    ()       => ['forms', 'templates'],
  draft:        (id)     => ['forms', id, 'draft'],
  published:    (id, lang) => ['forms', id, 'published', lang ?? 'en'],
  translations: (id)     => ['forms', id, 'translations'],
  setupStatus:  (programId) => ['programs', programId, 'setup-status'],
  judging:      (programId) => ['programs', programId, 'judging'],
  library:      (params) => ['criteria-library', params ?? {}],
}

/** Normalises the forms list to { results, counts }. counts is null until R-9. */
function normaliseList(data) {
  if (Array.isArray(data)) return { results: data, counts: null }
  return { results: data?.results ?? [], counts: data?.counts ?? null }
}

// ── 3.4 Forms list and 3.4b wizard ─────────────────────────────────────────

export function useForms(params) {
  return useQuery({
    queryKey: formKeys.list(params),
    queryFn:  async () => normaliseList(await api.list(params)),
  })
}

export function useFormTemplates() {
  return useQuery({
    queryKey: formKeys.templates(),
    queryFn:  () => api.templates(),
    staleTime: 5 * 60 * 1000,
  })
}

export function useCreateForm() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body) => api.create(body),
    onSuccess:  () => qc.invalidateQueries({ queryKey: formKeys.all }),
  })
}

export function useDuplicateForm() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id) => api.duplicate(id),
    onSuccess:  () => qc.invalidateQueries({ queryKey: formKeys.all }),
  })
}

export function useArchiveForm() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id) => api.archive(id),
    onSuccess:  () => qc.invalidateQueries({ queryKey: formKeys.all }),
  })
}

// ── 3.5 Builder and 3.5b Setswana ──────────────────────────────────────────

export function useFormDraft(id) {
  return useQuery({
    queryKey: formKeys.draft(id),
    queryFn:  () => api.draft(id),
    enabled:  !!id,
  })
}

/** Autosave: the builder keeps the whole form in local state and calls this debounced. */
export function useSaveFormDraft(id) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (doc) => api.saveDraft(id, doc),
    onSuccess:  (saved) => {
      if (saved) qc.setQueryData(formKeys.draft(id), saved)
    },
  })
}

export function usePublishForm(id) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => api.publish(id),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['forms'] }),
  })
}

export function usePublishedForm(id, lang) {
  return useQuery({
    queryKey: formKeys.published(id, lang),
    queryFn:  () => api.published(id, lang),
    enabled:  !!id,
  })
}

export function useFormTranslations(id) {
  return useQuery({
    queryKey: formKeys.translations(id),
    queryFn:  async () => {
      const data = await api.translations(id)
      return Array.isArray(data) ? data : (data?.results ?? [])
    },
    enabled:  !!id,
  })
}

export function useSaveTranslations(id) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (rows) => api.saveTranslations(id, rows),
    onSuccess:  () => {
      qc.invalidateQueries({ queryKey: formKeys.translations(id) })
      qc.invalidateQueries({ queryKey: formKeys.draft(id) })
    },
  })
}

export function useSuggestTranslations(id) {
  return useMutation({ mutationFn: (keys) => api.suggest(id, keys) })
}

export function useRequestTranslationReview(id) {
  return useMutation({ mutationFn: (body) => api.requestReview(id, body) })
}

// ── 3.6 Challenge builder ──────────────────────────────────────────────────

export function useProgramSetupStatus(programId) {
  return useQuery({
    queryKey: formKeys.setupStatus(programId),
    queryFn:  () => programSetup.setupStatus(programId),
    enabled:  !!programId,
    retry:    false,
  })
}

export function useAttachProgramForm(programId) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (formId) => programSetup.attachForm(programId, formId),
    onSuccess:  () => {
      qc.invalidateQueries({ queryKey: ['programs', programId] })
      qc.invalidateQueries({ queryKey: formKeys.all })
    },
  })
}

// ── 3.6 judging step and 3.7 marking criteria (B5) ─────────────────────────

export function useProgramJudging(programId) {
  return useQuery({
    queryKey: formKeys.judging(programId),
    queryFn:  () => programJudging.get(programId),
    enabled:  !!programId,
    retry:    false,
  })
}

export function useSaveProgramJudging(programId) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body) => programJudging.save(programId, body),
    onSuccess:  (saved) => {
      if (saved) qc.setQueryData(formKeys.judging(programId), saved)
      qc.invalidateQueries({ queryKey: formKeys.setupStatus(programId) })
    },
  })
}

export function useCriteriaLibrary(params) {
  return useQuery({
    queryKey: formKeys.library(params),
    queryFn:  () => programJudging.library(params),
    retry:    false,
  })
}

export function useAddLibraryCriterion() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body) => programJudging.addToLibrary(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['criteria-library'] }),
  })
}
