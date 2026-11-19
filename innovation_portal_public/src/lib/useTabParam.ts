import { useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'

/**
 * The selected tab lives in the URL (?tab=updates). A missing or not-allowed value falls back to
 * the first tab this person can see. const [tab, setTab] = useTabParam(visibleTabs)
 */
export function useTabParam<K extends string>(tabs: { key: K; hidden?: boolean; disabled?: boolean }[], { param = 'tab' } = {}): [K, (key: K) => void] {
  const [params, setParams] = useSearchParams()
  const keys = tabs.filter((t) => !t.hidden && !t.disabled).map((t) => t.key)
  const wanted = params.get(param) as K | null
  const active = wanted && keys.includes(wanted) ? wanted : keys[0]
  const setActive = useCallback(
    (key: K) =>
      setParams(
        (p) => {
          const next = new URLSearchParams(p)
          next.set(param, key)
          return next
        },
        { replace: true },
      ),
    [setParams, param],
  )
  return [active, setActive]
}
