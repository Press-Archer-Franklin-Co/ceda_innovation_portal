import { useId, useRef, useState } from 'react'
import { FileText, ImagePlus, Paperclip, X } from 'lucide-react'
import Button from '../../ui/Button'
import { useI18n } from '../../../i18n'
import { mediaService } from '../../../services/media.service'

/**
 * The answer stored for a file or media field: the uploaded MediaAssets.
 * The API does not check this type's shape; keeping the name and kind lets
 * the read-only idea view (2.4) say "3 photos · costing.xlsx".
 */
export interface UploadedFile {
  id: string
  filename: string
  kind: string
  url: string
}

export function uploadedFiles(value: unknown): UploadedFile[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is UploadedFile => Boolean(item) && typeof item === 'object' && 'id' in item)
}

interface UploadFieldProps {
  label: string
  hint?: string
  error?: string
  required: boolean
  media: boolean
  value: unknown
  onChange: (value: UploadedFile[]) => void
  disabled: boolean
}

export default function UploadField({ label, hint, error, required, media, value, onChange, disabled }: UploadFieldProps) {
  const { t } = useI18n()
  const inputRef = useRef<HTMLInputElement>(null)
  const id = useId()
  const files = uploadedFiles(value)
  const [progress, setProgress] = useState<number | null>(null)
  const [failed, setFailed] = useState<string | null>(null)

  async function upload(list: FileList | null) {
    if (!list || list.length === 0) return
    setFailed(null)
    let current = files
    for (const file of Array.from(list)) {
      setProgress(0)
      try {
        const asset = await mediaService.upload(file, file.name, setProgress)
        current = [...current, { id: asset.id, filename: asset.original_filename || file.name, kind: asset.kind, url: asset.url }]
        onChange(current)
      } catch {
        setFailed(file.name)
      }
    }
    setProgress(null)
    if (inputRef.current) inputRef.current.value = ''
  }

  const describedBy = [error ? `${id}-err` : '', hint ? `${id}-hint` : ''].filter(Boolean).join(' ') || undefined

  return (
    <fieldset className="min-w-0" aria-describedby={describedBy}>
      <legend className="text-d-label text-text mb-2">
        {label}
        {required && <span aria-hidden className="text-primary"> *</span>}
      </legend>

      {files.length > 0 && (
        <ul className="mb-3 flex flex-col gap-2">
          {files.map((file) => (
            <li key={file.id} className="flex items-center gap-3 rounded-control border border-border bg-surface px-3 py-2">
              {file.kind === 'image' ? (
                <img src={file.url} alt="" className="h-10 w-10 rounded object-cover" />
              ) : (
                <FileText size={20} aria-hidden className="text-muted shrink-0" />
              )}
              <span className="min-w-0 flex-1 truncate text-d-body-s text-text">{file.filename}</span>
              {!disabled && (
                <button
                  type="button"
                  onClick={() => onChange(files.filter((f) => f.id !== file.id))}
                  aria-label={t('form.upload.remove', { name: file.filename })}
                  className="flex h-11 w-11 items-center justify-center rounded-control text-muted hover:bg-surface2 hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <X size={18} aria-hidden />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <input
        ref={inputRef}
        id={`${id}-input`}
        type="file"
        multiple
        className="sr-only"
        accept={media ? 'image/*,video/*' : undefined}
        disabled={disabled || progress !== null}
        onChange={(e) => upload(e.target.files)}
      />
      <Button
        type="button"
        variant="secondary"
        size="sm"
        icon={media ? <ImagePlus size={16} aria-hidden /> : <Paperclip size={16} aria-hidden />}
        disabled={disabled || progress !== null}
        onClick={() => inputRef.current?.click()}
      >
        {progress !== null ? t('form.upload.uploading', { percent: progress }) : media ? t('form.upload.addMedia') : t('form.upload.add')}
      </Button>

      {failed && (
        <p role="alert" className="text-d-cap text-danger mt-2">
          {t('form.upload.failed', { name: failed })}
        </p>
      )}
      {error && (
        <p id={`${id}-err`} role="alert" className="text-d-cap text-danger mt-2">
          {error}
        </p>
      )}
      {hint && (
        <p id={`${id}-hint`} className="text-d-cap text-muted mt-2">
          {hint}
        </p>
      )}
    </fieldset>
  )
}
