// Renders the error instead of a blank page.
//
// React unmounts the whole tree on an uncaught render error, so without this a
// bug in a page shows as an empty white screen — and React's console output is
// two separate messages, the cause and a generic "the above error occurred in
// <X>" notice, which is easy to lose. Diagnosing that from the outside took far
// longer than it should have.
import { Component } from 'react'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    // Keep both halves together, so the console shows the cause next to the
    // component stack rather than in two unrelated entries.
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary]', error, info?.componentStack)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    return (
      <div className="trace-page">
        <h1>Something broke on this page</h1>
        <p className="trace-empty">
          {String(error.message || error)}
        </p>
        <pre className="trace-pre">{String(error.stack || '')}</pre>
      </div>
    )
  }
}
