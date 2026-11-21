import { useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ImagePlus } from 'lucide-react'
import clsx from 'clsx'
import Input from '../../ui/Input'
import Button from '../../ui/Button'
import { useT } from '../../../i18n/context'
import { client } from '../../../lib/api/client'

const SIZES = ['small', 'medium', 'large']

function fileSize(bytes) {
  const size = Math.max(bytes || 0, 0)
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * U7 (Figma 3.8): the Hero photo block in the Hero banner editor.
 * value: null or {asset, size, alt: {en, tn}}. The upload is checked on the server: PNG only,
 * transparent background, at least 1200 px tall. The change goes live through the usual approval.
 */
export default function HeroPhotoField({ label, value, lang, onChange, errors = [] }) {
  const t = useT()
  const inputRef = useRef(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const asset = value?.asset || ''

  const photo = useQuery({
    queryKey: ['content', 'hero-photo', asset],
    queryFn: () => client.get(`/api/content/hero-photo/${asset}/`),
    enabled: Boolean(asset),
    staleTime: 5 * 60_000,
  })

  const errorFor = (part) => errors.find((e) => e.path?.includes(`photo.${part}`))?.message
  const set = (patch) => onChange({ size: 'medium', alt: { en: '', tn: '' }, ...(value || {}), ...patch })

  async function upload(file) {
    if (!file) return
    setUploading(true)
    setUploadError('')
    try {
      const body = new FormData()
      body.append('file', file)
      const data = await client.post('/api/content/hero-photo/', body)
      set({ asset: data.id })
    } catch (err) {
      const detail = err?.data?.errors?.file?.detail || err?.errors?.file?.detail
      setUploadError(detail || err?.message || t('home.photo.uploadError'))
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const alt = value?.alt ?? { en: '', tn: '' }
  const altHint = lang === 'tn' && alt.en ? t('home.englishWas', { text: alt.en }) : t('home.photo.altHint')

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline gap-2">
        <span className="text-[13px] font-semibold text-text">{label}</span>
        <span className="text-[12px] text-muted">{t('home.photo.optional')}</span>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/png"
        className="sr-only"
        aria-label={t('home.photo.upload')}
        onChange={(e) => upload(e.target.files?.[0])}
      />

      {!asset ? (
        <Button variant="secondary" icon={<ImagePlus size={16} aria-hidden />} loading={uploading} onClick={() => inputRef.current?.click()}>
          {uploading ? t('home.photo.uploading') : t('home.photo.upload')}
        </Button>
      ) : (
        <div className="flex items-center gap-3 rounded-card border border-border p-3">
          <div className="flex h-[88px] w-[72px] shrink-0 items-end justify-center overflow-hidden rounded-control bg-surface2">
            {photo.data?.src && <img src={photo.data.src} alt={t('home.photo.thumbAlt')} className="h-full w-full object-contain object-bottom" />}
          </div>
          <div className="min-w-0 flex-1">
            {photo.isError ? (
              <p role="alert" className="text-[12px] text-danger">{t('home.photo.loadError')}</p>
            ) : (
              <>
                <p className="truncate text-[13px] text-text">
                  {photo.data ? `${photo.data.filename} · ${fileSize(photo.data.size_bytes)}` : ' '}
                </p>
                <p className="mt-0.5 flex items-center gap-1.5 text-[12px] text-muted">
                  <span aria-hidden className="h-2 w-2 rounded-full bg-success" />
                  {t('home.photo.transparent')}
                </p>
              </>
            )}
            <div className="mt-1.5 flex gap-4">
              <button type="button" disabled={uploading} onClick={() => inputRef.current?.click()} className="text-[12px] font-semibold text-primary hover:underline disabled:opacity-50">
                {uploading ? t('home.photo.uploading') : t('home.photo.replace')}
              </button>
              <button type="button" onClick={() => onChange(null)} className="text-[12px] font-semibold text-primary hover:underline">
                {t('home.photo.remove')}
              </button>
            </div>
          </div>
        </div>
      )}
      {(uploadError || errorFor('asset')) && (
        <p role="alert" className="text-[12px] text-danger">{uploadError || errorFor('asset')}</p>
      )}

      {asset && (
        <>
          <fieldset>
            <legend className="mb-1.5 text-[13px] font-semibold text-text">{t('home.photo.size')}</legend>
            <div role="radiogroup" aria-label={t('home.photo.size')} className="grid grid-cols-3 gap-1 rounded-control bg-surface2 p-1">
              {SIZES.map((size) => (
                <label
                  key={size}
                  className={clsx(
                    'flex h-8 cursor-pointer items-center justify-center rounded-control text-[13px] focus-within:ring-2 focus-within:ring-primary',
                    (value?.size || 'medium') === size ? 'bg-surface font-semibold text-text shadow-sm' : 'text-muted hover:text-text',
                  )}
                >
                  <input type="radio" className="sr-only" name="hero-photo-size" value={size} checked={(value?.size || 'medium') === size} onChange={() => set({ size })} />
                  {t(`home.photo.${size}`)}
                </label>
              ))}
            </div>
          </fieldset>
          <Input
            label={t('home.photo.alt')}
            value={alt[lang] ?? ''}
            maxLength={200}
            required={lang === 'en'}
            hint={altHint}
            error={errorFor('alt')}
            onChange={(e) => set({ alt: { en: alt.en ?? '', tn: alt.tn ?? '', [lang]: e.target.value } })}
          />
        </>
      )}
      <p className="text-[12px] leading-relaxed text-muted">{t('home.photo.help')}</p>
    </div>
  )
}
