import { createElement, lazy, Suspense } from 'react'
import Skeleton from '../ui/Skeleton'

// Chart.js loads only when a chart is shown (ceda-routing section 2). Pages import charts from here.
// Keep small helpers (formatters, legends) out of this folder, or they would pull Chart.js in too.
const ChartCanvasImpl = lazy(() => import('./ChartCanvas'))

/** <ChartCanvas config={chartJsConfig} height={260} />: a skeleton of the same height while Chart.js loads. */
export function ChartCanvas(props) {
  const height = props.height ?? 260
  return createElement(Suspense, { fallback: createElement(Skeleton, { style: { height }, className: 'w-full' }) }, createElement(ChartCanvasImpl, props))
}
