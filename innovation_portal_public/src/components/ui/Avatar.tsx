import { useState } from 'react'
import clsx from 'clsx'

export interface AvatarProps {
  name: string
  src?: string | null
  size?: 'xs' | 'sm' | 'md' | 'lg'
  className?: string
  /** Decorative when the name is already written next to it. */
  decorative?: boolean
}

const sizes = { xs: 'w-6 h-6 text-[10px]', sm: 'w-8 h-8 text-[12px]', md: 'w-10 h-10 text-[14px]', lg: 'w-14 h-14 text-[18px]' }

export function initials(name: string | null | undefined) {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  const first = parts[0][0] ?? ''
  const last = parts.length > 1 ? parts[parts.length - 1][0] : ''
  return (first + last).toUpperCase()
}

/** Photo, or initials on the chocolate banner colour if there is no photo or it fails to load. */
export default function Avatar({ name, src, size = 'sm', className, decorative = false }: AvatarProps) {
  const [failed, setFailed] = useState(false)
  const label = decorative ? undefined : name
  return (
    <span
      role={decorative ? undefined : 'img'}
      aria-label={label}
      aria-hidden={decorative || undefined}
      className={clsx('inline-flex items-center justify-center rounded-full overflow-hidden shrink-0 bg-banner text-on-banner font-heading font-bold select-none', sizes[size], className)}
    >
      {src && !failed ? <img src={src} alt="" className="w-full h-full object-cover" onError={() => setFailed(true)} /> : initials(name)}
    </span>
  )
}
