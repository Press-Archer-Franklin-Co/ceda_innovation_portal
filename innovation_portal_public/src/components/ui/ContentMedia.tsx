import { useEffect, useRef, useState } from 'react'
import { Pause, Play, Volume2, VolumeX } from 'lucide-react'

type ContentMediaProps = {
  src: string | null | undefined
  alt: string
  isVideo?: boolean
  className?: string
  autoPlayMuted?: boolean
  showControls?: boolean
  loop?: boolean
  showMuteToggle?: boolean
}

export default function ContentMedia({
  src,
  alt,
  isVideo = false,
  className = '',
  autoPlayMuted = false,
  showControls = false,
  loop = false,
  showMuteToggle = false,
}: ContentMediaProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [muted, setMuted] = useState(autoPlayMuted)
  const [playing, setPlaying] = useState(autoPlayMuted)

  useEffect(() => {
    const video = videoRef.current
    if (!video || !isVideo) return
    video.muted = autoPlayMuted
    if (autoPlayMuted) {
      const attempt = video.play()
      if (attempt && typeof attempt.catch === 'function') {
        attempt.catch(() => setPlaying(false))
      }
    }
  }, [autoPlayMuted, isVideo, src])

  if (!src) return null

  if (!isVideo) {
    return <img src={src} alt={alt} className={className} loading="lazy" />
  }

  const toggleMute = () => {
    const video = videoRef.current
    if (!video) return
    const next = !video.muted
    video.muted = next
    setMuted(next)
  }

  const togglePlayback = () => {
    const video = videoRef.current
    if (!video) return
    if (video.paused) {
      const attempt = video.play()
      if (attempt && typeof attempt.catch === 'function') {
        attempt
          .then(() => setPlaying(true))
          .catch(() => setPlaying(false))
      } else {
        setPlaying(true)
      }
      return
    }
    video.pause()
    setPlaying(false)
  }

  return (
    <div className="relative h-full w-full">
      <video
        ref={videoRef}
        src={src}
        className={className}
        controls={showControls}
        autoPlay={autoPlayMuted}
        muted={muted}
        loop={loop || autoPlayMuted}
        playsInline
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
      />

      {!showControls && (
        <button
          type="button"
          onClick={togglePlayback}
          aria-label={playing ? 'Pause video' : 'Play video'}
          className="absolute bottom-3 right-3 z-10 flex items-center gap-1.5 rounded-full border border-white/20 bg-black/45 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur-sm transition hover:bg-black/55"
        >
          {playing ? <Pause size={13} /> : <Play size={13} />}
          {playing ? 'Pause' : 'Play'}
        </button>
      )}

      {showMuteToggle && (
        <button
          type="button"
          onClick={toggleMute}
          aria-label={muted ? 'Unmute video' : 'Mute video'}
          className="absolute bottom-3 left-3 z-10 flex items-center gap-1.5 rounded-full border border-white/20 bg-black/45 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur-sm transition hover:bg-black/55"
        >
          {muted ? <VolumeX size={13} /> : <Volume2 size={13} />}
          {muted ? 'Unmute' : 'Mute'}
        </button>
      )}
    </div>
  )
}
