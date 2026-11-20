import { useEffect, useRef } from 'react'
import Chart from 'chart.js/auto'

// The only place Chart.js is imported. Load it through ./lazy.js, never directly from a page.
/** label: what the chart shows, read by screen readers. Pair every chart with a "View as table" choice. */
export default function ChartCanvas({ config, height = 260, label }) {
  const canvasRef = useRef(null)
  const chartRef = useRef(null)

  useEffect(() => {
    if (!canvasRef.current) return undefined
    chartRef.current?.destroy()
    chartRef.current = new Chart(canvasRef.current, config)

    return () => {
      chartRef.current?.destroy()
      chartRef.current = null
    }
  }, [config])

  return (
    <div style={{ height }}>
      <canvas ref={canvasRef} role="img" aria-label={label} />
    </div>
  )
}
