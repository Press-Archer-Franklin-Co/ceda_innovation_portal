import ErrorState from './ErrorState'
import Button from './Button'
import { useT } from '../../i18n/context'

// After a deploy the old page files are gone, so a lazy import can fail. Offer a reload for that.
const isChunkError = (error) =>
  /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|ChunkLoadError/i.test(
    String(error?.message ?? error),
  )

/** What a page shows when it failed to draw. Used by PageErrorBoundary. */
export default function PageErrorFallback({ error, onRetry }) {
  const t = useT()
  if (isChunkError(error)) {
    return (
      <ErrorState title={t('error.newVersion')} message={t('error.newVersionBody')}>
        <Button size="sm" onClick={() => window.location.reload()}>{t('error.reload')}</Button>
      </ErrorState>
    )
  }
  return <ErrorState title={t('error.page')} message={t('error.pageBody')} onRetry={onRetry} />
}
