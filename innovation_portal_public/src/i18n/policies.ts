// U11C: the one reading template for About, Guidelines, Terms and Privacy (Figma 1.13).
// TODO tn-review: the Setswana strings below need a check by a Setswana speaker.

export const policiesEn = {
  'doc.over': 'About the portal',
  'doc.contents': 'On this page',
  'doc.updated': 'Last updated {date} · Version {version}',
  'doc.download': 'Download as PDF',
  'doc.englishFallback': 'Parts of this page are not in Setswana yet, so they show in English.',
  'doc.loadError': 'We could not load this page.',
  'doc.nav.about': 'About the portal',
  'doc.nav.guidelines': 'Guidelines',
  'doc.nav.terms_of_use': 'Terms of use',
  'doc.nav.terms_of_agreement': 'Terms of agreement',
  'doc.nav.privacy': 'Privacy',
} as const

export type PoliciesKey = keyof typeof policiesEn

export const policiesTn: Record<PoliciesKey, string> = {
  'doc.over': 'Ka ga potale',
  'doc.contents': 'Mo tsebeng e',
  'doc.updated': 'E fetotswe la bofelo {date} · Kgatiso {version}',
  'doc.download': 'Tsaya jaaka PDF',
  'doc.englishFallback': 'Dikarolo dingwe tsa tsebe e ga di ise di nne mo Setswaneng, ka jalo di bontshiwa ka Sekgoa.',
  'doc.loadError': 'Ga re a kgona go bula tsebe e.',
  'doc.nav.about': 'Ka ga potale',
  'doc.nav.guidelines': 'Kaedi',
  'doc.nav.terms_of_use': 'Melawana ya tiriso',
  'doc.nav.terms_of_agreement': 'Melawana ya tumalano',
  'doc.nav.privacy': 'Sephiri',
}
