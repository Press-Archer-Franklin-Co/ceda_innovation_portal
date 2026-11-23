import { useEffect, useState } from 'react'
import { Download, FileQuestion, Loader2, ZoomIn, ZoomOut } from 'lucide-react'
import Modal from './Modal'
import Button from './Button'
import ErrorState from './ErrorState'
import { useT } from '../../i18n/context'
import { previewKind, safeBlob } from '../../lib/documentPreview'

// Shows a file inside the app: PDFs in the browser's viewer, images with zoom, anything else a clear message and
// Download. It opens with the genie from the row that was pressed. Same component in both apps.

const ZOOMS = [1, 1.5, 2, 3]

export default function DocumentPreview({ open, onClose, triggerRef, file }) {
  const t = useT()
  const kind = file ? previewKind(file.name, file.mime) : 'other'
  const [state, setState] = useState({ kind: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const [zoom, setZoom] = useState(0)
  const [downloading, setDownloading] = useState(false)
  const [downloadFailed, setDownloadFailed] = useState(false)

  useEffect(() => {
    setZoom(0)
    setDownloadFailed(false)
  }, [file])

  useEffect(() => {
    if (!open || !file || kind === 'other') return undefined
    const controller = new AbortController()
    let url = ''
    setState({ kind: 'loading' })
    file.load(controller.signal).then(
      (blob) => {
        if (controller.signal.aborted) return
        url = URL.createObjectURL(safeBlob(blob, file.name, file.mime))
        setState({ kind: 'ready', url })
      },
      () => {
        if (!controller.signal.aborted) setState({ kind: 'error' })
      },
    )
    return () => {
      controller.abort()
      if (url) URL.revokeObjectURL(url)
    }
  }, [open, file, kind, attempt])

  async function download() {
    if (!file) return
    setDownloading(true)
    setDownloadFailed(false)
    try {
      await file.download()
    } catch {
      setDownloadFailed(true)
    } finally {
      setDownloading(false)
    }
  }

  const footer = (
    <div className="flex w-full flex-wrap items-center justify-between gap-2">
      {kind === 'image' && state.kind === 'ready' ? (
        <div className="flex items-center gap-1" role="group" aria-label={t('preview.zoom')}>
          <Button variant="ghost" size="sm" aria-label={t('preview.zoomOut')} disabled={zoom === 0} onClick={() => setZoom((z) => Math.max(0, z - 1))}><ZoomOut size={16} aria-hidden /></Button>
          <span aria-live="polite" className="w-12 text-center text-[13px] font-bold text-text">{Math.round(ZOOMS[zoom] * 100)}%</span>
          <Button variant="ghost" size="sm" aria-label={t('preview.zoomIn')} disabled={zoom === ZOOMS.length - 1} onClick={() => setZoom((z) => Math.min(ZOOMS.length - 1, z + 1))}><ZoomIn size={16} aria-hidden /></Button>
        </div>
      ) : <span />}
      <div className="flex flex-wrap items-center justify-end gap-2">
        {downloadFailed && <p role="alert" className="text-[13px] text-danger">{t('preview.downloadFailed')}</p>}
        <Button variant="secondary" icon={<Download size={16} aria-hidden />} loading={downloading} onClick={download}>{t('preview.download')}</Button>
      </div>
    </div>
  )

  return (
    <Modal open={open} onClose={onClose} triggerRef={triggerRef} size="xl" title={file?.name} footer={footer} bodyClassName="!p-0">
      <div className="flex h-[70dvh] min-h-[280px] items-center justify-center overflow-hidden bg-surface2">
        {kind === 'other' ? (
          <div className="flex max-w-sm flex-col items-center gap-2 p-6 text-center">
            <FileQuestion size={32} aria-hidden className="text-muted" />
            <p className="font-heading text-[16px] font-bold text-text">{t('preview.cant')}</p>
            <p className="text-[14px] text-muted">{t('preview.cantBody')}</p>
          </div>
        ) : state.kind === 'loading' ? (
          <p role="status" className="flex items-center gap-2 text-[14px] text-muted">
            <Loader2 size={18} aria-hidden className="animate-spin motion-reduce:animate-none" />
            {t('preview.loading')}
          </p>
        ) : state.kind === 'error' ? (
          <ErrorState title={t('preview.error')} message={t('preview.errorBody')} onRetry={() => setAttempt((n) => n + 1)} />
        ) : !open ? null /* The closing motion copies the panel: no copies of the PDF viewer. */ : kind === 'pdf' ? (
          <iframe src={state.url} title={file?.name} className="h-full w-full border-0 bg-surface" />
        ) : (
          <div className="h-full w-full overflow-auto overscroll-contain" tabIndex={0} role="region" aria-label={file?.name}>
            <img src={state.url} alt={file?.name ?? ''} style={{ width: `${ZOOMS[zoom] * 100}%` }} className="mx-auto block max-w-none" />
          </div>
        )}
      </div>
    </Modal>
  )
}
