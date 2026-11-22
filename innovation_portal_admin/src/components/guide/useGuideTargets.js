import { useCallback } from 'react'
import { useI18n } from '../../i18n/context'
import { collectMenu, collectTargets } from '../../lib/guide/guide'

/**
 * Collects, at the moment of asking, the guide targets that are in the page now and visible, with their short
 * labels from i18n (guide.target.<id>), and the menu links the person can see. Menus and buttons are already
 * hidden by capability, so this only ever lists things this person can use.
 */
export function useGuideTargets(menuSelector) {
  const { t } = useI18n()
  return useCallback(() => {
    if (typeof document === 'undefined') return { targets: [], menu: [] }
    const labelOf = (id) => {
      const key = `guide.target.${id}`
      const text = t(key)
      return text === key ? '' : text
    }
    return { targets: collectTargets(document, labelOf), menu: menuSelector ? collectMenu(document, menuSelector) : [] }
  }, [t, menuSelector])
}
