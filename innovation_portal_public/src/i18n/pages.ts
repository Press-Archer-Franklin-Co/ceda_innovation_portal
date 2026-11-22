// Strings for the Help page (/faq), rebuilt in D3. About, Guidelines and the legal pages now take their text from the API (U11C).
// Spread into en.ts and tn.ts, so StringKey covers them.
//
// TODO tn-review: every Setswana string in pagesTn is a first draft and must be checked by a Setswana speaker
// at CEDA before launch.

export const pagesEn = {
  'help.over': 'Help centre',
  'help.title': 'How can we help?',
  'help.sub': 'Answers about ideas, challenges, your account, WhatsApp and USSD.',
  'help.search': 'Search help, e.g. "reference number"',
  'help.clear': 'Clear search',
  'help.topics': 'Topics',
  'help.other': 'More questions',
  'help.answers': '{n} answers',
  'help.answersOne': '1 answer',
  'help.popular': 'Popular questions',
  'help.allTopics': 'All topics',
  'help.matches': 'Answers for "{q}"',
  'help.loadError': 'We could not load the questions',
  'help.empty': 'There are no questions here yet',
  'help.emptyBody': 'Our team is adding them. In the meantime, ask us directly.',
  'help.noMatch': 'No questions match "{q}"',
  'help.noMatchBody': 'Try other words, or ask us directly.',
  'help.count': '{n} questions match "{q}"',
  'help.countOne': '1 question matches "{q}"',
  'help.stillTitle': 'Still need help?',
  'help.emailTitle': 'Email the innovation team',
  'help.whatsappWhen': 'Any time',
  'help.callWhen': 'Free from landlines',
  'help.officeWhen': 'Find your nearest office',
} as const

export const pagesTn: Record<keyof typeof pagesEn, string> = {
  'help.over': 'Lefelo la thuso', // TODO tn-review
  'help.title': 'Re ka go thusa jang?', // TODO tn-review
  'help.sub': 'Dikarabo ka dikakanyo, dikgwetlho, akhaonto ya gago, WhatsApp le USSD.', // TODO tn-review
  'help.search': 'Batla thuso, s.k. "nomoro ya tshupetso"', // TODO tn-review
  'help.clear': 'Phimola patlo', // TODO tn-review
  'help.topics': 'Dithitokgang', // TODO tn-review
  'help.other': 'Dipotso tse dingwe', // TODO tn-review
  'help.answers': 'Dikarabo di le {n}', // TODO tn-review
  'help.answersOne': 'Karabo e le 1', // TODO tn-review
  'help.popular': 'Dipotso tse di botswang thata', // TODO tn-review
  'help.allTopics': 'Dithitokgang tsotlhe', // TODO tn-review
  'help.matches': 'Dikarabo tsa "{q}"', // TODO tn-review
  'help.loadError': 'Ga re a kgona go bula dipotso', // TODO tn-review
  'help.empty': 'Ga go ise go nne le dipotso fa', // TODO tn-review
  'help.emptyBody': 'Setlhopha sa rona se a di tsenya. Ka nako eo, re botse.', // TODO tn-review
  'help.noMatch': 'Ga go na dipotso tse di tsamaelanang le "{q}"', // TODO tn-review
  'help.noMatchBody': 'Leka mafoko a mangwe, kgotsa re botse.', // TODO tn-review
  'help.count': 'Dipotso di le {n} di tsamaelana le "{q}"', // TODO tn-review
  'help.countOne': 'Potso e le 1 e tsamaelana le "{q}"', // TODO tn-review
  'help.stillTitle': 'O sa ntse o tlhoka thuso?', // TODO tn-review
  'help.emailTitle': 'Kwalela setlhopha sa boitlhamedi', // TODO tn-review
  'help.whatsappWhen': 'Nako nngwe le nngwe', // TODO tn-review
  'help.callWhen': 'Mahala go tswa mo megaleng ya mo gae', // TODO tn-review
  'help.officeWhen': 'Bona ofisi e e gaufi le wena', // TODO tn-review
}
