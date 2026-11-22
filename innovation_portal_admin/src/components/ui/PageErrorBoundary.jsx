import { Component } from 'react'
import PageErrorFallback from './PageErrorFallback'
import { boot } from '../../lib/boot'

/**
 * Catches a page that fails to draw (ceda-routing section 1). Shows the shared ErrorState with Retry,
 * never the stack trace; the error goes to the console in development only. Pass resetKey (the path)
 * so moving to another page clears it.
 */
export default class PageErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null, key: props.resetKey }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  static getDerivedStateFromProps(props, state) {
    return props.resetKey !== state.key ? { error: null, key: props.resetKey } : null
  }

  componentDidCatch(error, info) {
    // The page's own error (with Retry) is what to show, so start-up is over (U12 loader).
    boot.done('page')
    if (import.meta.env.DEV) console.error('Page failed to draw', error, info?.componentStack)
  }

  render() {
    if (this.state.error) return <PageErrorFallback error={this.state.error} onRetry={() => this.setState({ error: null })} />
    return this.props.children
  }
}
