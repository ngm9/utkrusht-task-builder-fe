// Configure the generated @ngm9/recruiter-client ONCE, and re-export the
// task-builder operation fns App.jsx needs.
//
// baseUrl:'' keeps every request relative so the Vite dev proxy handles it
// same-origin (no CORS). getHeaders attaches the dev testmaker JWT + the
// recruiter token-source header the Flask middleware picks its secret from.
import { configureRecruiterClient } from '@ngm9/recruiter-client'
import { getJwt } from './auth.js'

configureRecruiterClient({
  baseUrl: '',
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
