import { createRoot } from 'react-dom/client'
import posthog from 'posthog-js'
import './index.css'
import App from './App.jsx'
import TraceApp from './components/trace/TraceApp.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import { env } from './runtime-env.js'

// PostHog: no-op unless VITE_POSTHOG_KEY is set (so local dev stays clean).
// Autocapture handles pageviews + clicks; no per-event wiring needed.
const PH_KEY = env('VITE_POSTHOG_KEY')
if (PH_KEY) {
  posthog.init(PH_KEY, {
    api_host: env('VITE_POSTHOG_HOST') || 'https://us.i.posthog.com',
    person_profiles: 'identified_only',
  })
}

// No <StrictMode>: its dev-only double-invoke would start two sessions and two
// SSE streams. The app already guards its one-time init.
// Routing by pathname rather than a router dependency: there is exactly one
// other page, and /trace is an internal debugging view — not worth pulling in
// react-router and its bundle for. Revisit if a third route appears.
//
// nginx and the vite dev server both fall back to index.html for unknown paths,
// so /trace serves this bundle without any server config.
const isTrace = window.location.pathname.replace(/\/+$/, '') === '/trace'

createRoot(document.getElementById('root')).render(
  <ErrorBoundary>{isTrace ? <TraceApp /> : <App />}</ErrorBoundary>,
)
