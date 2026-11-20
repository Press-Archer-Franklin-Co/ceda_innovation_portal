import { DependencyList, useCallback, useEffect, useRef, useState } from 'react'

export interface AsyncState<T> {
  data: T | undefined
  error: unknown
  /** True only on the first load (no data yet). */
  loading: boolean
  /** True whenever a request is in flight, including a refresh that keeps the old data on screen. */
  fetching: boolean
  reload: () => void
}

/**
 * Loads data and keeps the previous result on screen while it reloads (for a language switch or a
 * filter). Pass the language in deps so content is fetched again in the new language.
 */
export function useAsync<T>(load: () => Promise<T>, deps: DependencyList): AsyncState<T> {
  const [data, setData] = useState<T | undefined>(undefined)
  const [error, setError] = useState<unknown>(null)
  const [fetching, setFetching] = useState(true)
  const [tick, setTick] = useState(0)
  const loadRef = useRef(load)
  loadRef.current = load

  useEffect(() => {
    let alive = true
    setFetching(true)
    setError(null)
    loadRef.current()
      .then((result) => alive && setData(result))
      .catch((err) => alive && setError(err))
      .finally(() => alive && setFetching(false))
    return () => {
      alive = false
    }
  }, [...deps, tick]) // eslint-disable-line react-hooks/exhaustive-deps

  const reload = useCallback(() => setTick((n) => n + 1), [])
  return { data, error, loading: fetching && data === undefined, fetching, reload }
}
