// Configure the generated @ngm9/recruiter-client ONCE, and re-export the
// task-builder operation fns App.jsx needs.
//
// getHeaders attaches the dev testmaker JWT + the recruiter token-source header
// the Flask middleware picks its secret from. Every task-builder route is
// PUBLIC, so the JWT is optional — it only matters if this client is ever
// pointed at a guarded route.
import { configureRecruiterClient } from '@ngm9/recruiter-client'
import { getJwt } from './auth.js'

// EMPTY in local dev -> relative /v2/*, which the Vite dev-server proxy
// forwards to the local backend, same-origin, no CORS.
//
// SET in a deployed build -> absolute backend URL, called cross-origin, so the
// deployed frontend's origin MUST be in the backend's FLASK_CORS_ORIGINS.
// Vite inlines this at build time, so it is a Docker BUILD ARG, never a runtime
// env var — setting it in Coolify's runtime environment does nothing.
//
// This was previously hardcoded to '', which meant a container build ignored
// VITE_API_BASE entirely and every /v2/* call hit nginx's SPA fallback and came
// back as index.html where the client expected JSON.
const API_BASE = (import.meta.env.VITE_API_BASE || '').replace(/\/+$/, '')

configureRecruiterClient({
  baseUrl: API_BASE,
  getHeaders: async () => {
    const jwt = getJwt()
    return jwt
      ? { Authorization: `Bearer ${jwt}`, 'X-Token-Source': 'recruiter' }
      : { 'X-Token-Source': 'recruiter' }
  },
})

// NOTE: no listTaskBuilderSessions — Flask has no GET /v2/task-builder/sessions
// (only POST). It existed in a hand-packed client build; the published one is
// generated from the real OpenAPI spec, so re-exporting it fails the build.
export {
  getTaskBuilderGreeting,
  createTaskBuilderSession,
  getTaskBuilderSession,
  createTaskBuilderMessage,
  getTaskBuilderScenarios,
  getTaskBuilderInstructionSuggestions,
  prepareTaskBuilderRun,
  generateTaskBuilderRun,
  getTaskBuilderRun,
} from '@ngm9/recruiter-client'
