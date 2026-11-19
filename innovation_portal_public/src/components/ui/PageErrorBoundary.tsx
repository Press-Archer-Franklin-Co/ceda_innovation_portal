import { Component, ErrorInfo, ReactNode } from 'react'
import { ErrorState } from './EmptyState'
import Button from './Button'
import { useT } from '../../i18n'

// After a deploy the old page files are gone, so a lazy import can fail. Offer a reload for that.
const isChunkError = (error: unknown) =>
  /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|ChunkLoadError/i.test(
    String((error as Error)?.message ?? error),
  )

function PageErrorFallback({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const t = useT()
  const chunk = isChunkError(error)
  return (
    <div className="max-w-[1200px] mx-auto px-5 lg:px-6 py-10">
      {chunk ? (
        <ErrorState title={t('error.newVersion')} body={t('error.newVersionBody')}>
          <Button size="sm" onClick={() => window.location.reload()}>
            {t('error.reload')}
          </Button>
        </ErrorState>
      ) : (
        <ErrorState title={t('error.page')} body={t('error.pageBody')} onRetry={onRetry} />
      )}
    </div>
  )
}

interface Props {
  /** Change it (the path) to clear the error when the person moves to another page. */
  resetKey?: string
  children: ReactNode
}

interface State {
  error: unknown
  key?: string
}

/**
 * A page that fails to draw shows the shared ErrorState with Retry, never a blank page or a stack
 * trace (ceda-routing section 1). The error goes to the console in development only.
 */
export default class PageErrorBoundary extends Component<Props, State> {
  state: State = { error: null, key: this.props.resetKey }

  static getDerivedStateFromError(error: unknown): Partial<State> {
    return { error }
  }

  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    return props.resetKey !== state.key ? { error: null, key: props.resetKey } : null
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    if (import.meta.env.DEV) console.error('Page failed to draw', error, info.componentStack)
  }

  render() {
    if (this.state.error) return <PageErrorFallback error={this.state.error} onRetry={() => this.setState({ error: null })} />
    return this.props.children
  }
}
