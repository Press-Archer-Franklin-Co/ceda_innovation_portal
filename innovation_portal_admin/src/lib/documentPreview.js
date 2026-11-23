// What the document preview can show, and how it fetches a file. Pure where it can be, so it can be tested.
// Same logic in both apps (public: documentPreview.ts).
//
// Security: the file comes through the same access-checked request as Download. The bytes are re-labelled with a
// fixed safe type before the browser draws them, so an uploaded web page or SVG can never run in the app. SVG is
// deliberately not previewed.

const IMAGES = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' }
const SAFE_IMAGE_TYPES = Object.values(IMAGES)

const extension = (name) => (name || '').split('?')[0].split('.').pop()?.toLowerCase() ?? ''

/** The fixed type to show this file as, or null when it cannot be shown here. */
export function previewType(name, mime) {
  const type = (mime || '').split(';')[0].trim().toLowerCase()
  if (type === 'application/pdf') return 'application/pdf'
  if (SAFE_IMAGE_TYPES.includes(type)) return type
  if (type && type !== 'application/octet-stream') return null // a declared other type wins over the file name
  const ext = extension(name)
  if (ext === 'pdf') return 'application/pdf'
  return IMAGES[ext] ?? null
}

/** pdf, image or other. A browser without a PDF viewer (Android Chrome) gets the download fallback. */
export function previewKind(name, mime, pdfViewer = browserHasPdfViewer()) {
  const type = previewType(name, mime)
  if (!type) return 'other'
  if (type === 'application/pdf') return pdfViewer ? 'pdf' : 'other'
  return 'image'
}

export function browserHasPdfViewer() {
  return typeof navigator === 'undefined' || navigator.pdfViewerEnabled !== false
}

/** The same bytes, labelled with the fixed safe type. */
export function safeBlob(blob, name, mime) {
  return new Blob([blob], { type: previewType(name, mime) ?? 'application/octet-stream' })
}

/** Only ordinary web addresses are fetched or linked. */
export function isWebUrl(url) {
  if (!url) return false
  try {
    const parsed = new URL(url, window.location.href)
    return parsed.protocol === 'https:' || parsed.protocol === 'http:'
  } catch {
    return false
  }
}

/** A form upload (a media file with an address): how to load and download it. */
export function urlFile(file) {
  return {
    name: file.name,
    mime: file.mime,
    load: async (signal) => {
      if (!isWebUrl(file.url)) throw new Error('Not a web address')
      const response = await fetch(file.url, { signal, credentials: 'same-origin' })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      return response.blob()
    },
    download: async () => {
      if (!isWebUrl(file.url)) throw new Error('Not a web address')
      const a = document.createElement('a')
      a.href = file.url
      a.download = file.name
      a.rel = 'noopener'
      a.click()
    },
  }
}
