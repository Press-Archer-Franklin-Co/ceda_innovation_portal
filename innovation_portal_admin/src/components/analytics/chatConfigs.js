// Chart.js configs for Reports > Live chat. Plain objects, token colours only: Chart.js loads only in ChartCanvas.
import { baseOptions, tokenColor } from './chartTheme'

const withLegend = (options) => ({
  ...options,
  plugins: { ...options.plugins, legend: { display: true, position: 'bottom', labels: { color: tokenColor('muted'), boxWidth: 12, font: { size: 11 } } } },
})

export function perDayConfig(rows, { t }) {
  const day = (d) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-BW', { timeZone: 'UTC', day: 'numeric', month: 'short' })
  const line = (label, key, color) => ({ label, data: rows.map((r) => r[key]), borderColor: tokenColor(color), backgroundColor: tokenColor(color, 0.15), pointRadius: rows.length > 31 ? 0 : 2, cubicInterpolationMode: 'monotone', borderWidth: 2 })
  return {
    type: 'line',
    data: { labels: rows.map((r) => day(r.date)), datasets: [line(t('chatrep.startedSeries'), 'started', 'primary'), line(t('chatrep.answeredSeries'), 'answered', 'success')] },
    options: withLegend(baseOptions({ tooltip: { displayColors: true } })),
  }
}

export function byChannelConfig(rows, { t }) {
  const bars = (label, key, color) => ({ label, data: rows.map((r) => r[key]), backgroundColor: tokenColor(color, 0.85), borderRadius: 4, maxBarThickness: 28 })
  return {
    type: 'bar',
    data: { labels: rows.map((r) => t(`chatrep.ch.${r.channel}`)), datasets: [bars(t('chatrep.startedSeries'), 'started', 'primary'), bars(t('chatrep.answeredSeries'), 'answered', 'success')] },
    options: withLegend(baseOptions({ tooltip: { displayColors: true } })),
  }
}

export function ratingsConfig(rows, { t }) {
  return {
    type: 'bar',
    data: {
      labels: rows.map((r) => t('chatrep.stars', { n: r.stars })),
      datasets: [{ data: rows.map((r) => r.count), backgroundColor: tokenColor('amber', 0.9), borderRadius: 4, maxBarThickness: 18 }],
    },
    options: baseOptions({ horizontal: true }),
  }
}
