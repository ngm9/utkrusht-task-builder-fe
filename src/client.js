// Configure the generated @ngm9/recruiter-client ONCE, and re-export the
// task-builder operation fns App.jsx needs.
//
// getHeaders attaches the dev testmaker JWT + the recruiter token-source header
// the Flask middleware picks its secret from. Every task-builder route is
// PUBLIC, so the JWT is optional — it only matters if this client is ever
// pointed at a guarded route.
import { configureRecruiterClient } from '@ngm9/recruiter-client'
import { getJwt } from './auth.js'
import { env } from './runtime-env.js'

// EMPTY under `vite dev` -> relative /v2/*, which the dev-server proxy forwards
// to the local backend, same-origin, no CORS.
//
// In a container it comes from the SERVICE ENVIRONMENT via /env.js — set it in
// Coolify and restart, no rebuild. The entrypoint refuses to start without it,
// because an empty value would send every /v2/* call into nginx's SPA fallback
// and return index.html where this client expects JSON.
//
// Cross-origin either way once deployed, so the frontend's origin must be in
// the backend's FLASK_CORS_ORIGINS.
const API_BASE = env('VITE_API_BASE').replace(/\/+$/, '')

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
