import { useCallback, useRef, useState } from 'react'
import { useToast } from '../ui/toast'
import { useT } from '../../i18n/context'
import { analytics } from '../../lib/api/endpoints'
import { exportBody, exportFileName } from '../../lib/analytics/dashboard'

const POLL_MS = 2000
const MAX_POLLS = 45 // 90 seconds, then we say it is slow instead of waiting for ever

const wait = (ms) => new Promise((resolve) => { setTimeout(resolve, ms) })

/** Saves a blob through a temporary link. The API download needs the sign-in, so a plain link would not work. */
function saveBlob(blob, name) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/**
 * 3.2 exports (R-35): POST /analytics/exports/, poll until ready, then a toast with a Download button.
 * Returns [start(report, format, filters), busy]. busy is true while this caller has an export running.
 * Needs reports.export; callers hide the menu otherwise.
 */
export function useAnalyticsExport() {
  const t = useT()
  const toast = useToast()
  const running = useRef(new Set())
  const [busy, setBusy] = useState(false)

  const start = useCallback(async (report, format, filters) => {
    const key = `${report}:${format}:${JSON.stringify(filters)}`
    if (running.current.has(key)) return
    running.current.add(key)
    setBusy(true)
    const fail = (message) => toast.show({ tone: 'error', title: t('exp.failed'), body: message ? t('exp.failedBody', { message }) : undefined })
    try {
      toast.show({ tone: 'info', title: t('exp.making'), body: t('exp.makingBody') })
      let job = await analytics.createExport(exportBody(report, format, filters))
      for (let i = 0; i < MAX_POLLS && job?.status !== 'ready' && job?.status !== 'failed'; i += 1) {
        await wait(POLL_MS)
        job = await analytics.exportStatus(job.id)
      }
      if (job?.status === 'failed') return fail(job.error)
      if (job?.status !== 'ready') return toast.show({ tone: 'warning', title: t('exp.slow'), body: t('exp.slowBody') })
      const name = exportFileName(report, format)
      toast.show({
        tone: 'success',
        title: t('exp.ready'),
        body: name,
        duration: 30000,
        action: {
          label: t('exp.save'),
          onClick: async () => {
            try { saveBlob(await analytics.downloadExport(job.id), name) } catch (err) { fail(err?.message) }
          },
        },
      })
    } catch (err) {
      fail(err?.message)
    } finally {
      running.current.delete(key)
      setBusy(running.current.size > 0)
    }
  }, [t, toast])
  return [start, busy]
}
