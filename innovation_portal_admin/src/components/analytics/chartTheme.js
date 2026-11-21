// Colours and shared options for the B7 charts. Colours come from the Option D tokens (tokens.css),
// read when the chart is drawn, so dark mode and token changes follow. No Chart.js import here.
import { CHANNEL_TOKEN } from '../../lib/analytics/dashboard'

const cache = new Map()

/** A token such as 'primary' as a Chart.js colour, for example 'rgba(160, 30, 10, 1)'. */
export function tokenColor(name, alpha = 1) {
  if (typeof window === 'undefined') return `rgba(0, 0, 0, ${alpha})`
  const dark = document.documentElement.dataset.theme === 'dark' ? 'd' : 'l'
  const key = `${name}:${dark}`
  if (!cache.has(key)) {
    const raw = getComputedStyle(document.documentElement).getPropertyValue(`--c-${name}`).trim()
    cache.set(key, raw ? raw.split(/\s+/).join(', ') : '0, 0, 0')
  }
  return `rgba(${cache.get(key)}, ${alpha})`
}

export const channelColor = (channel, alpha = 1) => tokenColor(CHANNEL_TOKEN[channel] ?? 'muted', alpha)

/** Options every chart shares: no animation when reduced motion is asked for, token text colours. */
export function baseOptions({ horizontal = false, tooltip = {}, onClick } = {}) {
  const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  const grid = tokenColor('border', 0.7)
  const text = tokenColor('muted')
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: reduce ? false : { duration: 250 },
    indexAxis: horizontal ? 'y' : 'x',
    interaction: { mode: 'index', intersect: false },
    onClick,
    onHover: onClick ? (event, elements) => { event.native.target.style.cursor = elements.length ? 'pointer' : 'default' } : undefined,
    plugins: {
      legend: { display: false },
      tooltip: { displayColors: false, padding: 10, titleFont: { weight: 'bold' }, ...tooltip },
    },
    scales: {
      x: { grid: { display: horizontal, color: grid }, ticks: { color: text, font: { size: 11 } }, beginAtZero: true, ...(horizontal ? { ticks: { color: text, precision: 0 } } : {}) },
      y: { grid: { display: !horizontal, color: grid }, ticks: { color: text, font: { size: 11 }, ...(horizontal ? {} : { precision: 0 }) }, beginAtZero: true },
    },
  }
}
