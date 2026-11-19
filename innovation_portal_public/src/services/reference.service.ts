import api from './api'
import { query, unwrapData } from './envelope'
import type { Lang } from '../types/innovator'

export interface ReferenceItem {
  id: string
  slug: string
  /** In the language asked for, English when missing. */
  name: string
  ordering: number
}

const cache = new Map<string, Promise<ReferenceItem[]>>()

function load(kind: 'sectors' | 'districts', lang: Lang): Promise<ReferenceItem[]> {
  const key = `${kind}:${lang}`
  let promise = cache.get(key)
  if (!promise) {
    promise = api
      .get(`/reference/${kind}/${query({ lang })}`)
      .then(({ data }) => unwrapData<ReferenceItem[]>(data))
      .catch((error) => {
        cache.delete(key)
        throw error
      })
    cache.set(key, promise)
  }
  return promise
}

/** Public reference lists (B1). Cached for the visit. */
export const referenceService = {
  sectors: (lang: Lang) => load('sectors', lang),
  districts: (lang: Lang) => load('districts', lang),
}
