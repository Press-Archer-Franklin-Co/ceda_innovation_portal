// U11C: page not found and the error page (Figma 1.14).
// TODO tn-review: the Setswana strings below need a check by a Setswana speaker.

export const statusEn = {
  'notFound.title': 'We could not find that page',
  'notFound.body': 'The link may be old, or the page has moved. Try searching, or go back to the start.',
  'notFound.search': 'Search challenges, news and help',
  'notFound.home': 'Go to Home',
  'notFound.challenges': 'See challenges',
  'notFound.staff': 'Go to the staff portal',
  'error.title': 'Something went wrong on our side',
  'error.body': 'Please try again. If it keeps happening, tell us this code: {code}.',
} as const

export type StatusKey = keyof typeof statusEn

export const statusTn: Record<StatusKey, string> = {
  'notFound.title': 'Ga re a bona tsebe eo',
  'notFound.body': 'Kgolagano e ka tswa e le ya bogologolo, kgotsa tsebe e sutile. Leka go batla, kgotsa boela kwa tshimologong.',
  'notFound.search': 'Batla dikgwetlho, dikgang le thuso',
  'notFound.home': 'Ya kwa Gae',
  'notFound.challenges': 'Bona dikgwetlho',
  'notFound.staff': 'Ya kwa potaleng ya badiri',
  'error.title': 'Sengwe se ile phoso ka fa go rona',
  'error.body': 'Tsweetswee leka gape. Fa se tswelela, re bolelele khoutu e: {code}.',
}
