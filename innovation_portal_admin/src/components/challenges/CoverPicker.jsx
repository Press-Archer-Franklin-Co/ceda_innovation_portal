import { useId, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ImagePlus, Trash2 } from 'lucide-react'
import Button from '../ui/Button'
import Skeleton from '../ui/Skeleton'
import { useT } from '../../i18n/context'
import { client } from '../../lib/api/client'
import { uploadImage } from '../../lib/api/partners'
import { COVER_TYPES, coverProblem } from '../../lib/challenges/cover'

/**
 * The challenge cover picture (3.6, details step). The picture is uploaded to the
 * media library as soon as it is chosen; the challenge keeps only its id, which is
 * saved with the rest of the step. `value` is the media id or null.
 */
export default function CoverPicker({ value, onChange, altText = '', api = { uploadImage, getMedia: (id) => client.get(`/api/media/${id}/`) } }) {
  const t = useT()
  const inputId = useId()
  const inputRef = useRef(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState(null)
  const [fresh, setFresh] = useState(null)

  const asset = useQuery({
    queryKey: ['media', value],
    queryFn: () => api.getMedia(value),
    enabled: !!value && fresh?.id !== value,
    staleTime: 10 * 60 * 1000,
  })
  const shown = value ? (fresh?.id === value ? fresh : asset.data) : null

  async function onPick(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setError(null)
    const problem = coverProblem(file)
    if (problem) return setError(t(problem))
    setUploading(true)
    try {
      const saved = await api.uploadImage(file, altText)
      setFresh(saved)
      onChange(saved.id)
    } catch (err) {
      const first = err?.data?.file?.[0] ?? err?.data?.data?.file?.[0]
      setError(typeof first === 'string' ? first : t('cover.uploadError'))
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={inputId} className="text-[13px] font-bold text-text">
        {t('cover.label')} <span className="font-normal text-muted">({t('cover.optional')})</span>
      </label>
      <p className="text-d-cap text-muted">{t('cover.hint')}</p>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="aspect-[16/9] w-full overflow-hidden rounded-card border border-border bg-surface2 sm:w-64">
          {value && !shown && asset.isLoading ? (
            <Skeleton className="h-full w-full" />
          ) : shown?.url ? (
            <img src={shown.url} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-muted">
              <ImagePlus size={22} aria-hidden />
              <span className="sr-only">{t('cover.none')}</span>
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" size="sm" loading={uploading} onClick={() => inputRef.current?.click()}>
            {value ? t('cover.change') : t('cover.choose')}
          </Button>
          {value && (
            <Button variant="ghost" size="sm" icon={<Trash2 size={14} aria-hidden />} onClick={() => { setFresh(null); setError(null); onChange(null) }} disabled={uploading}>
              {t('cover.remove')}
            </Button>
          )}
        </div>
      </div>
      {value && asset.isError && !fresh && <p className="text-d-cap text-muted">{t('cover.loadError')}</p>}
      {error && <p role="alert" className="text-d-cap text-danger">{error}</p>}
      <input ref={inputRef} id={inputId} type="file" accept={COVER_TYPES.join(',')} className="sr-only" tabIndex={-1} onChange={onPick} />
    </div>
  )
}
