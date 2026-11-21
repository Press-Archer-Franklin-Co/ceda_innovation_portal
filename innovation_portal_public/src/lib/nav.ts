import type { StringKey } from '../i18n'

// U7: the main navigation, used by the desktop header and the phone menu.
// Exactly four links. "Submit an idea" (and "New idea" when signed in) is a button
// on the right, not a link here; CI checks that (scripts/check_u7_removed.sh).
// "My ideas" lives in the account menu and on the innovator dashboard.

export interface NavItem {
  to: string
  key: StringKey
  end?: boolean
}

export const NAV_LINKS: NavItem[] = [
  { to: '/', key: 'nav.home', end: true },
  { to: '/challenges', key: 'nav.challenges' },
  { to: '/news', key: 'nav.newsStories' },
  { to: '/faq', key: 'nav.faq' },
]
