import { useId, useRef, useState } from 'react'
import { FileText, Film, Trash2, Upload } from 'lucide-react'
import Button from '../ui/Button'
import { useT } from '../../i18n/context'
import { uploadCover } from '../../lib/api/websiteContent'
import { COVER_IMAGE as IMAGE, COVER_VIDEO as VIDEO, coverFileProblem } from '../../lib/content/posts'

/**
 * 3.10 cover: a picture, or a video with a captions file. The file is uploaded to the media
 * library when chosen; the post keeps its id. `cover` is the post's cover object from the API
 * ({ id, kind, url }) for the current picture.
 */
export default function PostCover({ cover, onChange, altText }) {
  const t = useT()
  const fileId = useId()
  const fileInput = useRef(null)
  const captionsInput = useRef(null)
  const [video, setVideo] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')

  async function upload(file, captions) {
    setUploading(true)
    setError('')
    try {
      const asset = await uploadCover(file, { captions, altText })
      setVideo(null)
      onChange(asset)
    } catch (err) {
      const first = err?.data?.file?.[0] ?? err?.data?.captions?.[0] ?? err?.data?.errors?.file?.[0]
      setError(typeof first === 'string' ? first : t('post.coverUploadError'))
    } finally {
      setUploading(false)
    }
  }

  function onFile(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    const problem = coverFileProblem(file)
    if (problem) return setError(t(problem))
    if (VIDEO.includes(file.type)) {
      setVideo(file)
      setError('')
      return
    }
    upload(file)
  }

  function onCaptions(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (file && video) upload(video, file)
  }

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={fileId} className="text-[13px] font-bold text-text">{t('post.cover')}</label>
      {cover?.url ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="aspect-[16/9] w-full overflow-hidden rounded-card border border-border bg-surface2 sm:w-72">
            {cover.kind === 'video' ? (
              <video src={cover.url} className="h-full w-full object-cover" muted controls preload="metadata" />
            ) : (
              <img src={cover.url} alt="" className="h-full w-full object-cover" />
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" loading={uploading} onClick={() => fileInput.current?.click()}>{t('post.coverChange')}</Button>
            <Button variant="ghost" size="sm" icon={<Trash2 size={14} aria-hidden />} onClick={() => onChange(null)} disabled={uploading}>{t('post.coverRemove')}</Button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => fileInput.current?.click()} disabled={uploading}
          className="flex min-h-40 flex-col items-center justify-center gap-2 rounded-card border border-dashed border-border bg-surface2 px-4 py-6 text-center hover:border-primary disabled:opacity-60">
          <Upload size={20} aria-hidden className="text-muted" />
          <span className="text-[14px] font-bold text-text">{uploading ? t('post.saving') : t('post.coverDrop')}</span>
          <span className="text-[12px] text-muted">{t('post.coverHint')}</span>
        </button>
      )}
      {video && (
        <div className="flex flex-col gap-2 rounded-card border border-border bg-surface p-3">
          <p className="flex items-center gap-2 text-[13px] font-semibold text-text"><Film size={15} aria-hidden /> {video.name}</p>
          <p className="text-[12px] text-muted">{t('post.captionsHint')}</p>
          <Button variant="secondary" size="sm" icon={<FileText size={14} aria-hidden />} loading={uploading} onClick={() => captionsInput.current?.click()} className="self-start">
            {t('post.captionsChoose')}
          </Button>
          <input ref={captionsInput} type="file" accept=".vtt,.srt,text/vtt" className="sr-only" tabIndex={-1} onChange={onCaptions} aria-label={t('post.captions')} />
        </div>
      )}
      {error && <p role="alert" className="text-[12px] text-danger">{error}</p>}
      <input ref={fileInput} id={fileId} type="file" accept={[...IMAGE, ...VIDEO].join(',')} className="sr-only" tabIndex={-1} onChange={onFile} />
    </div>
  )
}
