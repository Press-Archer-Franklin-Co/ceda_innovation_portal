import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { approvals, faqsApi, homePage, partnersApi, posts, quotes, siteSettings, storiesApi, subscribers } from '../api/websiteContent'

export const contentKeys = {
  sectionTypes: ()      => ['content', 'section-types'],
  homeDraft:    ()      => ['content', 'home', 'draft'],
  homePreview:  (lang)  => ['content', 'home', 'preview', lang],
  approvals:    (status) => ['content', 'approvals', status ?? 'all'],
  posts:        (params) => ['content', 'posts', params ?? {}],
  post:         (id)     => ['content', 'post', id],
  subscribers:  ()       => ['content', 'subscribers'],
  quotes:       ()       => ['content', 'quotes'],
  siteSettings: ()       => ['content', 'site-settings'],
  partners:     ()       => ['content', 'partners'],
  faqs:         ()       => ['content', 'faqs'],
  stories:      ()       => ['content', 'stories'],
}

const list = (data) => (Array.isArray(data) ? data : data?.results ?? [])

export function useSectionTypes() {
  return useQuery({ queryKey: contentKeys.sectionTypes(), queryFn: async () => list(await homePage.sectionTypes()), staleTime: 30 * 60 * 1000 })
}

export function useHomeDraft() {
  // The editor keeps its own copy once loaded, so no refetch on focus while someone is typing.
  return useQuery({ queryKey: contentKeys.homeDraft(), queryFn: () => homePage.draft(), refetchOnWindowFocus: false, staleTime: Infinity })
}

export function useSaveHomeDraft() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (sections) => homePage.saveDraft(sections),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['content', 'home', 'preview'] }),
  })
}

/** Ask only once the draft has loaded: the first draft request makes the default sections (see R-28). */
export function useHomePreview(lang, enabled = true) {
  return useQuery({ queryKey: contentKeys.homePreview(lang), queryFn: () => homePage.preview(lang), refetchOnWindowFocus: false, enabled })
}

export function useSubmitHome() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (publishAt) => homePage.submit(publishAt),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['content'] }),
  })
}

export function useApprovals(status) {
  return useQuery({ queryKey: contentKeys.approvals(status), queryFn: async () => list(await approvals.list(status)) })
}

export function useDecideApproval() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, approve, comment }) => (approve ? approvals.approve(id, comment) : approvals.reject(id, comment)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['content'] }),
  })
}

// ── 3.9 and 3.10 posts ──────────────────────────────────────────────────────

export function usePosts(params) {
  return useQuery({
    queryKey: contentKeys.posts(params),
    queryFn: async () => {
      const data = await posts.list(params)
      return { results: data?.results ?? (Array.isArray(data) ? data : []), counts: data?.counts ?? null }
    },
  })
}

export function usePost(id) {
  return useQuery({ queryKey: contentKeys.post(id), queryFn: () => posts.get(id), enabled: !!id, refetchOnWindowFocus: false })
}

export function useSubscriberCounts() {
  return useQuery({ queryKey: contentKeys.subscribers(), queryFn: () => subscribers.counts(), staleTime: 5 * 60 * 1000 })
}

/** One hook for the row and editor actions; each refreshes the lists afterwards. */
export function usePostAction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ action, id, value }) => {
      if (action === 'create') return posts.create(value)
      if (action === 'update') return posts.update(id, value)
      if (action === 'remove') return posts.remove(id)
      if (action === 'submit') return posts.submit(id, value)
      if (action === 'pin') return posts.pin(id, value)
      if (action === 'duplicate') return posts.duplicate(id)
      if (action === 'unpublish') return posts.unpublish(id)
      if (action === 'blast') return posts.blast(id)
      throw new Error(`Unknown action ${action}`)
    },
    onSuccess: (data, { action, id }) => {
      qc.invalidateQueries({ queryKey: ['content', 'posts'] })
      qc.invalidateQueries({ queryKey: ['content', 'approvals'] })
      if (id && action !== 'remove' && data?.id === id) qc.setQueryData(contentKeys.post(id), data)
    },
  })
}

// ── 3.12 leadership quotes ──────────────────────────────────────────────────

export function useQuotes() {
  return useQuery({
    queryKey: contentKeys.quotes(),
    queryFn: async () => {
      const data = await quotes.list()
      const items = Array.isArray(data) ? data : data?.results ?? []
      return [...items].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    },
  })
}

export function useSiteSettings() {
  return useQuery({ queryKey: contentKeys.siteSettings(), queryFn: () => siteSettings.get(), staleTime: 60 * 1000 })
}

export function useQuoteAction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ action, id, value }) => {
      if (action === 'create') return quotes.create(value)
      if (action === 'update') return quotes.update(id, value)
      if (action === 'remove') return quotes.remove(id)
      if (action === 'reorder') return quotes.reorder(value)
      if (action === 'photo') return quotes.photo(id, value)
      if (action === 'rotation') return siteSettings.update({ quote_rotation_seconds: value })
      throw new Error(`Unknown action ${action}`)
    },
    onSuccess: (_data, { action }) => {
      qc.invalidateQueries({ queryKey: action === 'rotation' ? contentKeys.siteSettings() : contentKeys.quotes() })
      qc.invalidateQueries({ queryKey: ['content', 'approvals'] })
    },
  })
}

// ── 3.13 partners ───────────────────────────────────────────────────────────

export function usePartners() {
  return useQuery({
    queryKey: contentKeys.partners(),
    queryFn: async () => {
      const data = await partnersApi.list()
      return Array.isArray(data) ? data : data?.results ?? []
    },
  })
}

export function usePartnerAction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ action, id, value }) => {
      if (action === 'create') return partnersApi.create(value)
      if (action === 'update') return partnersApi.update(id, value)
      if (action === 'remove') return partnersApi.remove(id)
      throw new Error(`Unknown action ${action}`)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: contentKeys.partners() }),
  })
}

// ── 3.14 FAQs ───────────────────────────────────────────────────────────────

const rows = (data) => (Array.isArray(data) ? data : data?.results ?? [])

export function useFaqData() {
  return useQuery({
    queryKey: contentKeys.faqs(),
    queryFn: async () => {
      const [faqs, groups, unanswered] = await Promise.all([faqsApi.list(), faqsApi.groups(), faqsApi.unanswered()])
      return { faqs: rows(faqs), groups: rows(groups), unanswered: rows(unanswered) }
    },
  })
}

export function useFaqAction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ action, id, value }) => {
      const fn = {
        create: () => faqsApi.create(value),
        update: () => faqsApi.update(id, value),
        remove: () => faqsApi.remove(id),
        reorder: () => faqsApi.reorder(value),
        createGroup: () => faqsApi.createGroup(value),
        updateGroup: () => faqsApi.updateGroup(id, value),
        removeGroup: () => faqsApi.removeGroup(id),
        reorderGroups: () => faqsApi.reorderGroups(value),
        resolve: () => faqsApi.resolve(id, value),
      }[action]
      if (!fn) throw new Error(`Unknown action ${action}`)
      return fn()
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: contentKeys.faqs() }),
  })
}

// ── 3.11 stories ────────────────────────────────────────────────────────────

export function useStories() {
  return useQuery({ queryKey: contentKeys.stories(), queryFn: async () => rows(await storiesApi.list()) })
}

export function useStoryAction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ action, id, value }) => {
      if (action === 'create') return storiesApi.create(value)
      if (action === 'update') return storiesApi.update(id, value)
      if (action === 'remove') return storiesApi.remove(id)
      if (action === 'consent') return storiesApi.consent(id)
      throw new Error(`Unknown action ${action}`)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: contentKeys.stories() }),
  })
}
