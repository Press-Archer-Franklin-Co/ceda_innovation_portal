import { useEffect, useState } from 'react'

// True from the lg breakpoint (1024px): the builders show their full layout; below it, the phone layout.
const QUERY = '(min-width: 1024px)'

export function useWide() {
  const [wide, setWide] = useState(() => typeof window !== 'undefined' && window.matchMedia?.(QUERY).matches)
  useEffect(() => {
    const media = window.matchMedia?.(QUERY)
    if (!media) return undefined
    const onChange = () => setWide(media.matches)
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [])
  return wide
}
