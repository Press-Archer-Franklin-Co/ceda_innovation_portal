import { useEffect, useState } from 'react'
import api from '../../services/api'

/**
 * Data the header and footer need. Everything is optional: a value that has not arrived is
 * hidden, never replaced by a made-up number.
 *
 * Fields from GET /api/content/site-settings/ (B6, R-13). Blank values come back as null.
 */
export interface ShellSettings {
  whatsapp_number?: string | null
  ussd_code?: string | null
  call_centre_number?: string | null
  office_finder_url?: string | null
  help_centre_url?: string | null
  accessibility_url?: string | null
  footer_links?: { label: string; url: string }[] | null
  languages_enabled?: string[] | null
}

let settingsCache: ShellSettings | null = null
let settingsPromise: Promise<ShellSettings> | null = null

function loadSettings(): Promise<ShellSettings> {
  if (settingsCache) return Promise.resolve(settingsCache)
  settingsPromise ??= api
    .get<ShellSettings>('/content/site-settings/')
    .then(({ data }) => {
      settingsCache = data ?? {}
      return settingsCache
    })
    .catch(() => {
      settingsPromise = null
      return {}
    })
  return settingsPromise
}

/** Site settings for the shell. Returns {} until (or unless) they arrive. */
export function useShellSettings(): ShellSettings {
  const [settings, setSettings] = useState<ShellSettings>(settingsCache ?? {})
  useEffect(() => {
    let alive = true
    loadSettings().then((s) => alive && setSettings(s))
    return () => {
      alive = false
    }
  }, [])
  return settings
}

/** Unread notifications for the bell. undefined while unknown (no badge is shown). */
export function useUnreadCount(enabled: boolean): number | undefined {
  const [count, setCount] = useState<number | undefined>(undefined)
  useEffect(() => {
    if (!enabled) {
      setCount(undefined)
      return
    }
    let alive = true
    let timer: number | undefined
    const load = () =>
      api
        .get<{ data?: { unread_count?: number } }>('/notifications/unread-count/')
        .then(({ data }) => alive && setCount(data?.data?.unread_count))
        .catch((err: { response?: { status?: number } }) => {
          if (!alive) return
          setCount(undefined)
          // Refused (S1): stop asking until the person signs in again.
          const status = err?.response?.status
          if (status === 401 || status === 403) window.clearInterval(timer)
        })
    timer = window.setInterval(load, 60_000)
    load()
    return () => {
      alive = false
      window.clearInterval(timer)
    }
  }, [enabled])
  return count
}
