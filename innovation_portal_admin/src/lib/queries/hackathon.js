import { useQuery } from '@tanstack/react-query'
import { client } from '../api/client'

// 3.36: the hackathon page that is on now. GET /api/content/hackathons/active/ (R-59 item 2) answers it; until that
// exists, the list is searched for a page whose challenge is published and has not announced its results yet.

const asList = (data) => (Array.isArray(data) ? data : data?.results ?? [])

/** A page is live while its challenge is published and results are not out (or are still to come). */
export function isLive(page, now = Date.now()) {
  const info = page?.program_info
  if (!info || info.status !== 'published') return false
  return !info.results_announced_at || new Date(info.results_announced_at).getTime() > now
}

export function pickActive(pages, now = Date.now()) {
  const live = pages.filter((p) => isLive(p, now))
  // The one closing soonest is the one people need now.
  return live.sort((a, b) => String(a.program_info?.closes_at ?? '9').localeCompare(String(b.program_info?.closes_at ?? '9')))[0] ?? null
}

export function useActiveHackathon(enabled = true) {
  return useQuery({
    queryKey: ['content', 'hackathons', 'active'],
    enabled,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      try {
        const data = await client.get('/api/content/hackathons/active/')
        return data ?? null
      } catch (err) {
        if (err?.status !== 404 && err?.status !== 405) throw err
        return pickActive(asList(await client.get('/api/content/hackathons/')))
      }
    },
  })
}
