import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { approvals, homePage } from '../api/websiteContent'

export const contentKeys = {
  sectionTypes: ()      => ['content', 'section-types'],
  homeDraft:    ()      => ['content', 'home', 'draft'],
  homePreview:  (lang)  => ['content', 'home', 'preview', lang],
  approvals:    (status) => ['content', 'approvals', status ?? 'all'],
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
