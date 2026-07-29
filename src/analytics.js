// Thin PostHog wrapper. Every call no-ops unless VITE_POSTHOG_KEY is set —
// the same guard main.jsx inits under, so local dev stays clean.
//
// registerIds() attaches ids as super-properties: they ride on EVERY later
// event (autocapture included), which is what makes a session replay searchable
// by conversation_id / generation_run_id — find the video from the id.
import posthog from 'posthog-js'
import { env } from './runtime-env.js'

const ENABLED = !!env('VITE_POSTHOG_KEY')

export function registerIds(props) {
  if (ENABLED) posthog.register(props)
}

export function track(event, props = {}) {
  if (ENABLED) posthog.capture(event, props)
}
