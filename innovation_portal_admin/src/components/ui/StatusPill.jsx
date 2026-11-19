import Tag from './Tag'
import { statusWord } from '../../lib/status'
import { useT } from '../../i18n/context'

/**
 * Status chip with the CEDA status words (ceda-ui section 6, mapping in src/lib/status.js).
 * <StatusPill status={submission.current_status} />. An unknown value shows "Not known".
 * `label` replaces the word only when the screen has better words of its own; never pass a raw API value.
 * `variant` is the older name for `status`.
 */
export default function StatusPill({ variant, status, label, dot = true, className }) {
  const t = useT()
  const word = statusWord(status ?? variant)
  return (
    <Tag tone={word.tone} dot={dot} dotClassName={word.dot} className={className}>
      {label ?? t(word.labelKey)}
    </Tag>
  )
}
