import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useT } from '../../../i18n/context'
import { cn } from '../../../lib/cn'

/** Where the public site runs. The preview page is /preview/home there (same origin in production). */
const PUBLIC_ORIGIN = (import.meta.env.VITE_PUBLIC_SITE_URL || window.location.origin).replace(/\/$/, '')
const WIDTH = { desktop: 1280, phone: 390 }

/**
 * 3.8 Live preview: the public site's own home page sections (HomeSections) in an iframe,
 * scaled down to fit the panel. The draft sections go over postMessage, already in one
 * language and with their data; the preview page calls no content API.
 * `height` is the panel height in px, or 'auto' to show the whole page.
 */
export default function HomePreview({ sections, lang, device = 'desktop', height = 640, className }) {
  const t = useT()
  const frame = useRef(null)
  const box = useRef(null)
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)
  const [pageHeight, setPageHeight] = useState(1600)
  const [boxWidth, setBoxWidth] = useState(0)

  useEffect(() => {
    function onMessage(event) {
      if (event.origin !== PUBLIC_ORIGIN || event.source !== frame.current?.contentWindow) return
      if (event.data?.type === 'ceda-home-preview:ready') setReady(true)
      if (event.data?.type === 'ceda-home-preview:height' && Number.isFinite(event.data.height)) setPageHeight(Math.max(400, event.data.height))
    }
    window.addEventListener('message', onMessage)
    const timer = setTimeout(() => setFailed(true), 10000)
    return () => {
      window.removeEventListener('message', onMessage)
      clearTimeout(timer)
    }
  }, [])

  useEffect(() => {
    if (!ready) return
    frame.current?.contentWindow?.postMessage({ type: 'ceda-home-preview:page', sections, lang }, PUBLIC_ORIGIN)
  }, [ready, sections, lang])

  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    const measure = () => setBoxWidth(el.clientWidth)
    measure()
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null
    observer?.observe(el)
    return () => observer?.disconnect()
  }, [])

  const width = WIDTH[device] ?? WIDTH.desktop
  const scale = boxWidth ? Math.min(1, boxWidth / width) : 0
  const scaledHeight = pageHeight * scale

  return (
    <div ref={box} className={cn('relative w-full overflow-hidden rounded-card border border-border bg-surface', className)}>
      {failed && !ready ? (
        <p role="alert" className="p-4 text-[13px] text-danger">{t('home.previewFailed')}</p>
      ) : (
        <>
          {!ready && <p className="p-4 text-[13px] text-muted">{t('home.previewLoading')}</p>}
          <div className={cn('overflow-y-auto overscroll-contain overflow-x-hidden', !ready && 'invisible h-0')} style={height === 'auto' ? undefined : { height }}>
            <div style={{ height: scaledHeight, width: width * scale, margin: '0 auto' }}>
              <iframe
                ref={frame}
                title={t('home.livePreview')}
                src={`${PUBLIC_ORIGIN}/preview/home`}
                tabIndex={-1}
                onLoad={() => setFailed(false)}
                style={{ width, height: pageHeight, transform: `scale(${scale})`, transformOrigin: '0 0', border: 0, display: 'block' }}
              />
            </div>
          </div>
        </>
      )}
    </div>
  )
}
