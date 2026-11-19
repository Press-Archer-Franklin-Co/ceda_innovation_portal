import { useCallback, useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'

/**
 * Start a dialog's query as soon as the person shows intent, so its content exists on the
 * genie's first frame (ceda-genie-motion: "Prefetch on intent").
 *
 *   const intent = usePrefetchOnIntent(qk.program(id), () => programs.get(id))
 *   <button ref={triggerRef} {...intent} onClick={() => setOpen(true)}>Edit</button>
 *
 * pointerenter: prefetch after 80 ms (cancelled if the pointer leaves first).
 * pointerdown and keyboard focus: prefetch at once.
 * Uses the same query key as the dialog, so the dialog reads the cached result.
 */
export function usePrefetchOnIntent(queryKey, fetcher, { delayMs = 80, staleTime = 30_000, enabled = true } = {}) {
  const queryClient = useQueryClient()
  const timer = useRef(null)
  const keyRef = useRef(queryKey)
  const fetchRef = useRef(fetcher)
  keyRef.current = queryKey
  fetchRef.current = fetcher

  const prefetch = useCallback(() => {
    if (!enabled) return
    clearTimeout(timer.current)
    queryClient.prefetchQuery({ queryKey: keyRef.current, queryFn: () => fetchRef.current(), staleTime })
  }, [queryClient, enabled, staleTime])

  const onPointerEnter = useCallback(() => {
    if (!enabled) return
    clearTimeout(timer.current)
    timer.current = setTimeout(prefetch, delayMs)
  }, [prefetch, delayMs, enabled])

  const onPointerLeave = useCallback(() => clearTimeout(timer.current), [])

  useEffect(() => () => clearTimeout(timer.current), [])

  return { onPointerEnter, onPointerLeave, onPointerDown: prefetch, onFocus: prefetch }
}
