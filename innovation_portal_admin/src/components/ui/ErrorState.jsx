import { AlertCircle, RefreshCw } from 'lucide-react'
import { useT } from '../../i18n/context'
import Button from './Button'
import StateCard from './StateCard'

/**
 * Something failed: say what, in plain words, and offer Retry. Never show "empty" after a failure.
 * Props: title ("We could not load the review queue"), message, onRetry, retrying, compact, framed.
 */
export default function ErrorState({ title, message, onRetry, retrying = false, compact = false, framed = false, className }) {
  const t = useT()
  return (
    <StateCard icon={AlertCircle} tone="danger" title={title ?? t('common.somethingWrong')} body={message} compact={compact} framed={framed} className={className} role="alert">
      {onRetry && (
        <Button variant="soft" size="sm" onClick={onRetry} loading={retrying} icon={<RefreshCw size={13} aria-hidden />}>
          {t('common.retry')}
        </Button>
      )}
    </StateCard>
  )
}
