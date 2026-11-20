import { useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'

/**
 * The selected tab lives in the URL (?tab=faqs), so reload, back and shared links keep it.
 * `tabs` are the tabs this person can see (hidden ones already left out); a missing or
 * not-allowed ?tab= falls back to the first of them.
 *
 *   const [tab, setTab] = useTabParam(visibleTabs)
 *   <Tabs tabs={visibleTabs} active={tab} onChange={setTab} />
 */
export function useTabParam(tabs, { param = 'tab' } = {}) {
  const [params, setParams] = useSearchParams()
  const keys = tabs.filter((t) => !t.hidden && !t.disabled).map((t) => t.key)
  const wanted = params.get(param)
  const active = keys.includes(wanted) ? wanted : keys[0]
  const setActive = useCallback(
    (key) => setParams((p) => { const next = new URLSearchParams(p); next.set(param, key); return next }, { replace: true }),
    [setParams, param],
  )
  return [active, setActive]
}
