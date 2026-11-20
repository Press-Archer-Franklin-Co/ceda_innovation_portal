import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Move, ZoomIn } from 'lucide-react'
import { useT } from '../../i18n/context'

/**
 * Place and crop a picture before upload. `title` and `description` are optional (already translated) for a
 * specific use, such as a challenge cover; the defaults are general. Messages are stored as i18n keys.
 */
export default function ImageCropModal({ src, aspect = 4, outputWidth = 1600, fileName = 'banner.jpg', title, description, onApply, onCancel }) {
  const t = useT()
  const frameRef = useRef(null)
  const dragRef = useRef(null)
  const [img, setImg] = useState(null)
  const [frameWidth, setFrameWidth] = useState(0)
  const [zoom, setZoom] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [error, setError] = useState(null)

  const frameHeight = frameWidth / aspect

  useEffect(() => {
    const image = new Image()
    image.crossOrigin = 'anonymous'
    image.onload = () => setImg(image)
    image.onerror = () => setError('crop.loadError')
    image.src = src
  }, [src])

  useEffect(() => {
    const measure = () => setFrameWidth(frameRef.current?.clientWidth ?? 0)
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [])

  const scaleFor = useCallback((z) => {
    if (!img || !frameWidth) return 1
    return Math.max(frameWidth / img.naturalWidth, frameHeight / img.naturalHeight) * z
  }, [img, frameWidth, frameHeight])

  const clamp = useCallback((pos, z) => {
    const scale = scaleFor(z)
    const width = img.naturalWidth * scale
    const height = img.naturalHeight * scale
    return {
      x: Math.min(0, Math.max(frameWidth - width, pos.x)),
      y: Math.min(0, Math.max(frameHeight - height, pos.y)),
    }
  }, [img, frameWidth, frameHeight, scaleFor])

  useEffect(() => {
    if (!img || !frameWidth) return
    const scale = scaleFor(1)
    setZoom(1)
    setOffset({ x: (frameWidth - img.naturalWidth * scale) / 2, y: (frameHeight - img.naturalHeight * scale) / 2 })
  }, [img, frameWidth, frameHeight, scaleFor])

  const changeZoom = (nextZoom) => {
    const prevScale = scaleFor(zoom)
    const nextScale = scaleFor(nextZoom)
    const cx = (frameWidth / 2 - offset.x) / prevScale
    const cy = (frameHeight / 2 - offset.y) / prevScale
    setZoom(nextZoom)
    setOffset(clamp({ x: frameWidth / 2 - cx * nextScale, y: frameHeight / 2 - cy * nextScale }, nextZoom))
  }

  const onPointerDown = (e) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    dragRef.current = { startX: e.clientX, startY: e.clientY, origin: offset }
  }
  const onPointerMove = (e) => {
    if (!dragRef.current) return
    const { startX, startY, origin } = dragRef.current
    setOffset(clamp({ x: origin.x + e.clientX - startX, y: origin.y + e.clientY - startY }, zoom))
  }
  const onPointerUp = () => { dragRef.current = null }

  const apply = () => {
    const scale = scaleFor(zoom)
    const canvas = document.createElement('canvas')
    canvas.width = outputWidth
    canvas.height = Math.round(outputWidth / aspect)
    const ctx = canvas.getContext('2d')
    ctx.drawImage(img, -offset.x / scale, -offset.y / scale, frameWidth / scale, frameHeight / scale, 0, 0, canvas.width, canvas.height)
    try {
      canvas.toBlob((blob) => {
        if (!blob) { setError('crop.createError'); return }
        onApply(new File([blob], fileName.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' }))
      }, 'image/jpeg', 0.9)
    } catch {
      setError('crop.taintedError')
    }
  }

  const scale = scaleFor(zoom)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl mx-4">
        <div className="px-6 py-4 border-b border-ceda-border">
          <h2 className="text-base font-semibold text-ceda-dark">{title ?? t('crop.title')}</h2>
          <p className="text-xs text-ceda-muted mt-0.5">{description ?? t('crop.help')}</p>
        </div>
        <div className="px-6 py-5 space-y-4">
          {error && <p role="alert" className="text-sm text-ceda-red bg-ceda-red-pale rounded-lg px-3 py-2">{t(error)}</p>}
          <div
            ref={frameRef}
            className="relative w-full overflow-hidden rounded-xl bg-ceda-surface cursor-grab active:cursor-grabbing touch-none select-none ring-2 ring-ceda-green"
            style={{ height: frameHeight || 160 }}
            onPointerDown={img ? onPointerDown : undefined}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            {img && (
              <img
                src={src}
                alt=""
                draggable={false}
                className="absolute max-w-none pointer-events-none"
                style={{ left: offset.x, top: offset.y, width: img.naturalWidth * scale, height: img.naturalHeight * scale }}
              />
            )}
            <span className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-md bg-black/50 px-2 py-1 text-[11px] text-white">
              <Move size={11} aria-hidden /> {t('crop.drag')}
            </span>
          </div>
          <label className="flex items-center gap-3 text-sm text-ceda-dark">
            <ZoomIn size={16} className="text-ceda-muted" aria-hidden />
            <span className="sr-only">{t('crop.zoom')}</span>
            <input type="range" min="1" max="3" step="0.01" value={zoom} disabled={!img} onChange={(e) => changeZoom(Number(e.target.value))} className="flex-1 accent-ceda-green" />
            <span className="w-12 text-right tabular-nums text-xs text-ceda-muted">{Math.round(zoom * 100)}%</span>
          </label>
        </div>
        <div className="flex justify-end gap-2 px-6 py-4 border-t border-ceda-border">
          <button type="button" onClick={onCancel} className="btn-secondary btn-sm">{t('common.cancel')}</button>
          <button type="button" onClick={apply} disabled={!img} className="btn-primary btn-sm">{t('crop.apply')}</button>
        </div>
      </div>
    </div>
  )
}
