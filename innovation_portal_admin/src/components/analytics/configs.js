// Chart.js configs for 3.1 and 3.2, built from the B7 answers. Plain objects: Chart.js loads only in ChartCanvas.
import { baseOptions, channelColor, tokenColor } from './chartTheme'
import { dayLabel, periodEnd, periodLabel } from '../../lib/analytics/dashboard'

/** Ideas sent in per week or month. The tooltip names the exact days of the bar. */
export function seriesConfig(points, interval, { t, lang }) {
  return {
    type: 'bar',
    data: {
      labels: points.map((p) => periodLabel(p.period_start, interval, lang)),
      datasets: [{ data: points.map((p) => p.count), backgroundColor: tokenColor('primary', 0.85), hoverBackgroundColor: tokenColor('primary'), borderRadius: 4, maxBarThickness: 36 }],
    },
    options: baseOptions({
      tooltip: {
        callbacks: {
          title: (items) => {
            const p = points[items[0].dataIndex]
            if (interval === 'month') return periodLabel(p.period_start, 'month', lang, { long: true })
            return t('dash.series.range', { start: dayLabel(new Date(`${p.period_start}T00:00:00`), lang), end: dayLabel(periodEnd(p.period_start, 'week'), lang) })
          },
          label: (item) => t('dash.series.tip', { count: item.raw }),
        },
      },
    }),
  }
}

/** Open ideas per stage. The hold-up stage is orange; the others are soft red. */
export function pipelineConfig(rows, { t }) {
  return {
    type: 'bar',
    data: {
      labels: rows.map((r) => t(`dash.stage.${r.code}`)),
      datasets: [{
        data: rows.map((r) => r.count),
        backgroundColor: rows.map((r) => (r.bottleneck ? tokenColor('accent') : tokenColor('primary', 0.3))),
        borderColor: rows.map((r) => (r.bottleneck ? tokenColor('accent') : tokenColor('primary', 0.6))),
        borderWidth: 1,
        borderRadius: 4,
        maxBarThickness: 18,
      }],
    },
    options: baseOptions({
      horizontal: true,
      tooltip: {
        callbacks: {
          label: (item) => t('dash.series.tip', { count: item.raw }),
          afterLabel: (item) => (rows[item.dataIndex].waiting ? t('dash.pipe.waitingTip', { count: rows[item.dataIndex].waiting }) : ''),
        },
      },
    }),
  }
}

/** Ideas by channel, each channel in its own colour on every chart. Clicking a bar filters the page. */
export function channelConfig(rows, { t, onPick }) {
  return {
    type: 'bar',
    data: {
      labels: rows.map((r) => t(`dash.ch.${r.channel}`)),
      datasets: [{ data: rows.map((r) => r.count), backgroundColor: rows.map((r) => channelColor(r.channel, 0.9)), borderRadius: 4, maxBarThickness: 18 }],
    },
    options: baseOptions({
      horizontal: true,
      onClick: onPick ? (_e, elements) => { if (elements[0]) onPick(rows[elements[0].index].channel) } : undefined,
      tooltip: { callbacks: { label: (item) => `${t('dash.series.tip', { count: item.raw })} (${rows[item.dataIndex].pct}%)` } },
    }),
  }
}

/** Ideas that reached each step, as a share of those sent in. A step that is not tracked has no bar and says so. */
export function funnelConfig(rows, { t }) {
  return {
    type: 'bar',
    data: {
      labels: rows.map((r) => (r.count === null ? `${t(`rep.step.${r.step}`)}: ${t('rep.notTracked')}` : t(`rep.step.${r.step}`))),
      datasets: [{ data: rows.map((r) => r.count), backgroundColor: rows.map((_, i) => tokenColor('primary', Math.max(0.3, 0.95 - i * 0.13))), borderRadius: 4, maxBarThickness: 22 }],
    },
    options: baseOptions({
      horizontal: true,
      tooltip: { callbacks: { label: (item) => (rows[item.dataIndex].count === null ? t('rep.notTracked') : `${t('dash.series.tip', { count: item.raw })} (${rows[item.dataIndex].pct}%)`) } },
    }),
  }
}

/** Ideas per sector. Clicking a bar filters the page to that sector. */
export function sectorsConfig(rows, { t, onPick }) {
  return {
    type: 'bar',
    data: {
      labels: rows.map((r) => r.name),
      datasets: [{ data: rows.map((r) => r.count), backgroundColor: tokenColor('banner', 0.85), borderRadius: 4, maxBarThickness: 18 }],
    },
    options: baseOptions({
      horizontal: true,
      onClick: onPick ? (_e, elements) => { if (elements[0]) onPick(rows[elements[0].index].slug || rows[elements[0].index].id) } : undefined,
      tooltip: { callbacks: { label: (item) => t('dash.series.tip', { count: item.raw }) } },
    }),
  }
}
