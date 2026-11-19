import { useState } from 'react'
import { cn } from '../../lib/cn'

const sizes = { xs: 'w-6 h-6 text-[10px]', sm: 'w-7 h-7 text-[11px]', md: 'w-9 h-9 text-[13px]', lg: 'w-12 h-12 text-[16px]' }

function initialsOf(name = '') {
  const parts = String(name).trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  const last = parts.length > 1 ? parts[parts.length - 1][0] : ''
  return (parts[0][0] + last).toUpperCase()
}

/** Photo, or initials on the chocolate banner colour. decorative when the name is written next to it. */
export default function Avatar({ name, src, size = 'sm', className, decorative = false }) {
  const [failed, setFailed] = useState(false)
  return (
    <span
      role={decorative ? undefined : 'img'}
      aria-label={decorative ? undefined : name}
      aria-hidden={decorative || undefined}
      className={cn('inline-flex items-center justify-center rounded-full overflow-hidden shrink-0 bg-banner text-on-banner font-heading font-bold select-none', sizes[size] ?? sizes.sm, className)}
    >
      {src && !failed ? <img src={src} alt="" className="w-full h-full object-cover" onError={() => setFailed(true)} /> : initialsOf(name)}
    </span>
  )
}
