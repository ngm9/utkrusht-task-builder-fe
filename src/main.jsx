import { createRoot } from 'react-dom/client'
import posthog from 'posthog-js'
import './index.css'
import App from './App.jsx'
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
createRoot(document.getElementById('root')).render(<App />)
