import { useEffect, useState } from 'react'
import { authService, PublicConfig } from '../services/auth.service'

// GET /api/platform/public-config/ once per page load, shared by every caller. Switches change rarely,
// and the API checks them again on every request, so a stale value only changes what the screen asks.

let cached: PublicConfig | null = null
let pending: Promise<PublicConfig> | null = null

function load(): Promise<PublicConfig> {
  if (!pending) {
    pending = authService.getPublicConfig().then(
      (config) => (cached = config),
      (err) => {
        pending = null // try again next time
        throw err
      },
    )
  }
  return pending
}

/** null while loading or when it could not load. */
export function usePublicConfig(): PublicConfig | null {
  const [config, setConfig] = useState<PublicConfig | null>(cached)
  useEffect(() => {
    if (cached) return
    let live = true
    load().then((c) => live && setConfig(c), () => undefined)
    return () => {
      live = false
    }
  }, [])
  return config
}

/**
 * "Send ideas with just the basics" (Platform settings, default on). Off: quick start asks the problem and
 * the solution before Send. Unknown (still loading or failed) counts as on, like the API default; if the API
 * then asks for the answers, the screen shows the questions there.
 */
export function useBasicsOnly(): boolean {
  return basicsOnlyFrom(usePublicConfig())
}

export const basicsOnlyFrom = (config: Pick<PublicConfig, 'features'> | null | undefined): boolean =>
  config?.features?.quick_start_basics_only !== false

/** Tests only. */
export function resetPublicConfigCache() {
  cached = null
  pending = null
}
