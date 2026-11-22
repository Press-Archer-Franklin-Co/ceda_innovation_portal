// U12: the idea bulb loader.
// TODO tn-review: the Setswana strings below need a check by a Setswana speaker.

export const brandEn = {
  'loader.status': 'Loading the portal',
  'loader.failed': 'The portal could not start',
  'loader.failedBody': 'Something did not load. Check your connection and try again.',
}

export const brandTn: Record<keyof typeof brandEn, string> = {
  'loader.status': 'Re tsenya potale', // TODO tn-review
  'loader.failed': 'Potale ga e a kgona go simolola', // TODO tn-review
  'loader.failedBody': 'Sengwe ga se a tsena. Sekaseka kgokagano ya gago o bo o leke gape.', // TODO tn-review
}
