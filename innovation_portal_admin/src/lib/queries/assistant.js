import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { assistant as api } from '../api/assistant'

export const assistantKeys = {
  all:       ['assistant'],
  status:    ['assistant', 'status'],
  hints:     (id, lang) => ['assistant', 'submission', id, 'hints', lang],
  related:   (id, lang) => ['assistant', 'submission', id, 'related', lang],
  overview:  (lang) => ['assistant', 'admin', 'overview', lang],
  usage:     (days) => ['assistant', 'admin', 'usage', days],
  knowledge: ['assistant', 'admin', 'knowledge'],
  pages:     ['assistant', 'admin', 'pages'],
}

const rows = (data) => (Array.isArray(data) ? data : data?.results ?? [])

/** Which helper parts are on. A failure counts as "all off": the helper just stays hidden. */
export function useAssistantStatus({ enabled = true } = {}) {
  return useQuery({
    queryKey: assistantKeys.status,
    queryFn: () => api.status().catch(() => ({ available: false, features: {} })),
    staleTime: 60 * 1000,
    enabled,
  })
}

export function useSubmissionHints(id, lang, { enabled = true } = {}) {
  return useQuery({ queryKey: assistantKeys.hints(id, lang), queryFn: () => api.hints(id, { lang }), enabled: Boolean(id) && enabled, retry: false, staleTime: 5 * 60 * 1000 })
}

export function useRelatedIdeas(id, lang, { enabled = true } = {}) {
  return useQuery({ queryKey: assistantKeys.related(id, lang), queryFn: () => api.related(id, { lang }), enabled: Boolean(id) && enabled, retry: false, staleTime: 5 * 60 * 1000 })
}

export function useRefreshHint() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, lang, what }) => (what === 'related' ? api.related(id, { lang, refresh: true }) : api.hints(id, { lang, refresh: true })),
    onSuccess: (data, { id, lang, what }) => qc.setQueryData(what === 'related' ? assistantKeys.related(id, lang) : assistantKeys.hints(id, lang), data),
  })
}

export function useSuggestIntroduction() {
  return useMutation({ mutationFn: ({ id, body }) => api.introduce(id, body) })
}

// -- admin ----------------------------------------------------------------------------------------

export function useAssistantOverview(lang) {
  return useQuery({ queryKey: assistantKeys.overview(lang), queryFn: () => api.overview(lang), retry: false })
}

export function useAssistantUsage(days = 30) {
  return useQuery({ queryKey: assistantKeys.usage(days), queryFn: () => api.usage(days), retry: false })
}

export function useSaveAssistantSettings() {
  const qc = useQueryClient()
  return useMutation({ mutationFn: (body) => api.saveSettings(body), onSuccess: () => qc.invalidateQueries({ queryKey: assistantKeys.all }) })
}

export function useKnowledge() {
  return useQuery({ queryKey: assistantKeys.knowledge, queryFn: async () => rows(await api.knowledge()), retry: false })
}

export function useManualPages() {
  return useQuery({ queryKey: assistantKeys.pages, queryFn: async () => rows(await api.pages()), retry: false })
}

/** One mutation for every admin write; refreshes the lists after. */
export function useAssistantAdminAction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ action, id, value }) => {
      const run = {
        addKnowledge: () => api.addKnowledge(value),
        editKnowledge: () => api.editKnowledge(id, value),
        dropKnowledge: () => api.dropKnowledge(id),
        orderKnowledge: () => api.orderKnowledge(value),
        addPage: () => api.addPage(value),
        editPage: () => api.editPage(id, value),
        dropPage: () => api.dropPage(id),
        orderPages: () => api.orderPages(value),
        addScreenshot: () => api.addScreenshot(id, value.file, value.captions),
        editScreenshot: () => api.editScreenshot(id, value),
        dropScreenshot: () => api.dropScreenshot(id),
      }[action]
      if (!run) throw new Error(`Unknown action ${action}`)
      return run()
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['assistant', 'admin'] }),
  })
}

export function useTryIt() {
  return useMutation({ mutationFn: (body) => api.tryIt(body) })
}
