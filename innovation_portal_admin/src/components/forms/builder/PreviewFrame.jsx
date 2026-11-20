import { useEffect, useRef, useState } from 'react'
import { useT } from '../../../i18n/context'
import { cn } from '../../../lib/cn'

/** Where the public site runs. The preview page is /preview/form there (same origin in production). */
const PUBLIC_ORIGIN = (import.meta.env.VITE_PUBLIC_SITE_URL || window.location.origin).replace(/\/$/, '')

/**
 * 3.5 Preview: the public site's own FormRenderer in an iframe, so staff see exactly
 * what applicants see. The draft document goes over postMessage; nothing is saved
 * or sent to the API by the preview.
 */
export default function PreviewFrame({ doc, lang, device, stepIndex }) {
  const t = useT()
  const frame = useRef(null)
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    function onMessage(event) {
      if (event.origin !== PUBLIC_ORIGIN || event.source !== frame.current?.contentWindow) return
      if (event.data?.type === 'ceda-form-preview:ready') setReady(true)
    }
    window.addEventListener('message', onMessage)
    const timer = setTimeout(() => setFailed((f) => f || !frame.current), 8000)
    return () => {
      window.removeEventListener('message', onMessage)
      clearTimeout(timer)
    }
  }, [])

  useEffect(() => {
    if (!ready) return
    frame.current?.contentWindow?.postMessage({ type: 'ceda-form-preview:document', document: doc, lang, stepIndex }, PUBLIC_ORIGIN)
  }, [ready, doc, lang, stepIndex])

  return (
    <section aria-label={t('preview.title')} className="rounded-card border border-border bg-surface2 p-[14px]">
      <p className="mb-3 text-[13px] font-bold text-text">{t('preview.title')}</p>
      {failed && !ready ? (
        <p role="alert" className="text-[13px] text-danger">{t('preview.unavailable')}</p>
      ) : (
        <div className={cn('mx-auto overflow-hidden rounded-card border border-border bg-surface', device === 'phone' ? 'w-[390px] max-w-full' : 'w-full')}>
          {!ready && <p className="p-4 text-[13px] text-muted">{t('preview.loading')}</p>}
          <iframe
            ref={frame}
            title={t('preview.title')}
            src={`${PUBLIC_ORIGIN}/preview/form`}
            onError={() => setFailed(true)}
            className={cn('block h-[760px] w-full', !ready && 'invisible h-0')}
          />
        </div>
      )}
    </section>
  )
}
