import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Captions } from 'lucide-react'
import Modal from '../ui/Modal'
import Button from '../ui/Button'
import Skeleton from '../ui/Skeleton'
import { ErrorState } from '../ui/EmptyState'
import Tag from '../ui/Tag'
import { useI18n, StringKey } from '../../i18n'
import { useAsync } from '../../lib/useAsync'
import { formatDate } from '../../lib/dates'
import { publicContent, PostCard } from '../../services/publicContent.service'
import { postPath, postTypeTone } from './sections'

// Screen 1.4 Video story (Figma 12:360 website, 12:540 phone). Opens over the home page without leaving it.
// Captions are on by default; the transcript is the captions text (the API has no separate transcript), shown
// on demand under the video for low-data users. Related items keep people exploring. Esc closes.

/** Turns a WebVTT file into plain lines of speech. */
function vttToText(vtt: string): string[] {
  return vtt
    .replace(/\r/g, '')
    .split('\n\n')
    .map((block) =>
      block
        .split('\n')
        .filter((line) => line && !/^WEBVTT/.test(line) && !/^\d+$/.test(line) && !/-->/.test(line) && !/^(NOTE|STYLE|REGION)/.test(line))
        .join(' ')
        .replace(/<[^>]+>/g, '')
        .trim(),
    )
    .filter(Boolean)
}

export default function VideoStoryDialog({ post, onClose, onOpenPost }: { post: PostCard | null; onClose: () => void; onOpenPost?: (p: PostCard) => void }) {
  const { t, lang } = useI18n()
  const slug = post?.slug ?? ''
  const detail = useAsync(() => (slug ? publicContent.post(slug) : Promise.resolve(null)), [slug, lang])
  const [transcript, setTranscript] = useState<string[] | null>(null)
  const [showTranscript, setShowTranscript] = useState(false)

  const data = detail.data
  const captionsUrl = data?.cover?.captions_url ?? post?.cover?.captions_url ?? null

  useEffect(() => {
    setShowTranscript(false)
    setTranscript(null)
  }, [slug])

  useEffect(() => {
    if (!showTranscript || transcript || !captionsUrl) return
    fetch(captionsUrl)
      .then((r) => (r.ok ? r.text() : Promise.reject(r.status)))
      .then((text) => setTranscript(vttToText(text)))
      .catch(() => setTranscript([]))
  }, [showTranscript, transcript, captionsUrl])

  const cover = data?.cover ?? post?.cover ?? null

  return (
    // The open story lives in the address (?story=), so it also opens from a shared link; a pressed card is its origin.
    <Modal open={Boolean(post)} onClose={onClose} routeOpened size="xl" title={data?.title ?? post?.title} bodyClassName="!px-0 !pt-0 sm:!px-6">
      {detail.loading ? (
        <div className="px-5 sm:px-0 space-y-4" aria-hidden>
          <Skeleton className="w-full aspect-video rounded-none sm:rounded-card" />
          <Skeleton className="h-4 w-1/3" />
        </div>
      ) : detail.error ? (
        <div className="px-5 sm:px-0">
          <ErrorState title={t('video.loadError')} onRetry={detail.reload} framed={false} />
        </div>
      ) : (
        <div className="flex flex-col lg:flex-row gap-6">
          <div className="flex-1 min-w-0 flex flex-col gap-3">
            {cover?.kind === 'video' && cover.url ? (
              // Captions on by default (track default). The poster is the post cover when it is an image.
              <video controls playsInline preload="metadata" className="w-full aspect-video bg-scrim sm:rounded-card" crossOrigin="anonymous">
                <source src={cover.url} />
                {captionsUrl && <track kind="captions" src={captionsUrl} srcLang={lang} label={lang === 'tn' ? 'Setswana' : 'English'} default />}
              </video>
            ) : (
              <p className="px-5 sm:px-0 text-d-body-s text-muted">{t('video.noVideo')}</p>
            )}
            <div className="px-5 sm:px-0 flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-2">
                {data && <Tag tone={postTypeTone[data.type] ?? 'neutral'}>{t(`post.${data.type}` as StringKey)}</Tag>}
                <span className="text-d-cap text-muted">{formatDate(data?.published_at, lang)}</span>
              </div>
              {data?.excerpt && <p className="text-d-body-s text-muted">{data.excerpt}</p>}
              <div className="flex flex-wrap gap-2">
                {captionsUrl ? (
                  <Button variant="soft" size="sm" icon={<Captions size={16} aria-hidden />} aria-expanded={showTranscript} onClick={() => setShowTranscript((v) => !v)}>
                    {showTranscript ? t('video.hideTranscript') : t('video.showTranscript')}
                  </Button>
                ) : (
                  <p className="text-d-cap text-muted">{t('video.noCaptions')}</p>
                )}
                {data && (
                  <Link to={postPath(data)} onClick={onClose} className="inline-flex items-center gap-1.5 text-d-label text-primary hover:underline">
                    {t('video.readMore')}
                    <ArrowRight size={16} aria-hidden />
                  </Link>
                )}
              </div>
              {showTranscript && (
                <section aria-label={t('video.transcript')} className="rounded-card bg-surface2 p-4 max-h-60 overflow-y-auto text-d-body-s text-text space-y-2">
                  {transcript === null ? <Skeleton className="h-16 w-full" /> : transcript.map((line, i) => <p key={i}>{line}</p>)}
                </section>
              )}
            </div>
          </div>
          {data && data.related.length > 0 && (
            <aside className="lg:w-[280px] shrink-0 px-5 sm:px-0">
              <h3 className="text-d-h5 font-heading text-text mb-3">{t('video.related')}</h3>
              <ul className="flex flex-col gap-3">
                {data.related.map((r) => (
                  <li key={r.id}>
                    {r.cover?.kind === 'video' && onOpenPost ? (
                      <button type="button" onClick={() => onOpenPost(r)} className="text-left text-d-label text-text hover:text-primary hover:underline">
                        {r.title}
                      </button>
                    ) : (
                      <Link to={postPath(r)} onClick={onClose} className="text-d-label text-text hover:text-primary hover:underline">
                        {r.title}
                      </Link>
                    )}
                    <p className="text-d-cap text-muted">{formatDate(r.published_at, lang)}</p>
                  </li>
                ))}
              </ul>
            </aside>
          )}
        </div>
      )}
    </Modal>
  )
}
