import { useEffect, useState } from 'react'

export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(timer)
  }, [intervalMs])
  return now
}

function parts(target: number, now: number) {
  const total = Math.max(0, Math.floor((target - now) / 1000))
  return [
    { label: 'Days', value: Math.floor(total / 86400) },
    { label: 'Hrs', value: Math.floor((total % 86400) / 3600) },
    { label: 'Min', value: Math.floor((total % 3600) / 60) },
    { label: 'Sec', value: total % 60 },
  ]
}

export default function Countdown({ target, now, tone = 'light' }: { target: number; now: number; tone?: 'light' | 'dark' }) {
  const box = tone === 'dark'
    ? 'bg-white/10 border-white/15 text-white'
    : 'bg-[#F5EEE8] border-[#d6efe0] text-[#A01E0A]'
  const caption = tone === 'dark' ? 'text-white/55' : 'text-gray-500'
  return (
    <div className="flex items-stretch gap-2" role="timer" aria-live="off">
      {parts(target, now).map(({ label, value }) => (
        <div key={label} className={`min-w-[54px] rounded-xl border px-2 py-1.5 text-center ${box}`}>
          <p className="text-[20px] font-extrabold leading-none tabular-nums">{String(value).padStart(2, '0')}</p>
          <p className={`text-[9.5px] font-bold uppercase tracking-widest mt-1 ${caption}`}>{label}</p>
        </div>
      ))}
    </div>
  )
}
