import { useT } from '../../../i18n/context'
import { typeSpec } from '../../../lib/content/home'

/** Name of a section type in the chosen language, falling back to the API's English label. */
export function useSectionName() {
  const t = useT()
  return (types, type) => {
    const key = `home.type.${type}`
    const text = t(key)
    return text === key ? typeSpec(types, type)?.label ?? type : text
  }
}
