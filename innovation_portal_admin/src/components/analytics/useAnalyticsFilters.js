import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { readFilters, withFilter, withoutFilters } from '../../lib/analytics/dashboard'

/** The filters in the URL, for the API. */
export function useAnalyticsFilters() {
  const [params, setParams] = useSearchParams()
  const filters = useMemo(() => readFilters(params), [params])
  const set = useCallback((key, value) => setParams((p) => withFilter(p, key, value), { replace: true }), [setParams])
  const clear = useCallback(() => setParams((p) => withoutFilters(p), { replace: true }), [setParams])
  return { filters, set, clear }
}
