/** Downloads rows (arrays of cells) as a CSV file. Cells are quoted; a leading =, +, - or @ is escaped. */
export function downloadCsv(filename, rows) {
  const cell = (v) => {
    let text = v == null ? '' : String(v)
    if (/^[=+\-@]/.test(text)) text = `'${text}`
    return `"${text.replace(/"/g, '""')}"`
  }
  const csv = rows.map((r) => r.map(cell).join(',')).join('\r\n')
  const url = URL.createObjectURL(new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
