// The document preview (both apps use the same keys).
// TODO tn-review: the Setswana strings below need a check by a Setswana speaker.

export const previewEn = {
  'preview.open': 'Preview',
  'preview.openName': 'Preview {name}',
  'preview.loading': 'Opening the file…',
  'preview.cant': "This file can't be shown here",
  'preview.cantBody': 'Download it to open it on your device.',
  'preview.error': 'We could not open this file',
  'preview.errorBody': 'Try again, or download it.',
  'preview.download': 'Download',
  'preview.downloadFailed': 'The download did not work. Try again.',
  'preview.zoom': 'Zoom',
  'preview.zoomIn': 'Zoom in',
  'preview.zoomOut': 'Zoom out',
}

export const previewTn: Record<keyof typeof previewEn, string> = {
  'preview.open': 'Bona', // TODO tn-review
  'preview.openName': 'Bona {name}', // TODO tn-review
  'preview.loading': 'Faele e a bulwa…', // TODO tn-review
  'preview.cant': 'Faele e ga e kgone go bontshiwa fa', // TODO tn-review
  'preview.cantBody': 'E tsenye mo sedirisweng sa gago go e bula.', // TODO tn-review
  'preview.error': 'Ga re a kgona go bula faele e', // TODO tn-review
  'preview.errorBody': 'Leka gape, kgotsa e tsenye mo sedirisweng.', // TODO tn-review
  'preview.download': 'Tsenya', // TODO tn-review
  'preview.downloadFailed': 'Go tsenya ga go a dira. Leka gape.', // TODO tn-review
  'preview.zoom': 'Godisa', // TODO tn-review
  'preview.zoomIn': 'Godisa', // TODO tn-review
  'preview.zoomOut': 'Nnyefatsa', // TODO tn-review
}
