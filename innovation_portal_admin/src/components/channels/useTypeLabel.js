import { useI18n } from '../../i18n/context'

// The name of a step type in the staff language: WhatsApp's chat words where the strings have them, else the API's label.
export function useTypeLabel(channel) {
  const { t, lang } = useI18n()
  return (spec) => {
    if (!spec) return t('ch.status.unknown')
    const key = channel === 'whatsapp' ? `ch.wa.block.${spec.type}` : ''
    const own = key ? t(key) : key
    return key && own !== key ? own : lang === 'tn' ? spec.label_tn || spec.label : spec.label
  }
}
