// Trace API calls.
//
// Hand-written rather than from @ngm9/recruiter-client: these routes are on an
// unmerged branch, so no published client was generated from a spec containing
// them. Swap for the generated ops once they appear — every call site goes
// through here.
//
// Unlike the rest of this app, these routes are NOT public: they are left out of
// the backend's PUBLIC_ROUTES on purpose, because a run's llm_calls carry full
// prompts. So every call needs a testmaker JWT, and a 401 here means "sign in",
// not "something broke".
import { env } from './runtime-env.js'
import { getJwt } from './auth.js'

const API_BASE = env('VITE_API_BASE').replace(/\/+$/, '')

/** Thrown on 401 so the page can ask for a token instead of showing an error. */
export class TraceAuthError extends Error {}

async function get(path) {
  const jwt = getJwt()
  const res = await fetch(`${API_BASE}/v2/task-builder${path}`, {
    headers: {
      'X-Token-Source': 'recruiter',
      ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}),
    },
  })
  if (res.status === 401 || res.status === 403) throw new TraceAuthError('unauthorised')
  if (res.status === 503) throw new Error('Trace storage is not configured on this backend.')
  if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 160)}`)
  return res.json()
}

export const listTraces = (limit = 50) => get(`/traces?limit=${limit}`)
export const getTrace = (runId) => get(`/traces/${encodeURIComponent(runId)}`)
export const getTraceLog = (runId, name) =>
  get(`/traces/${encodeURIComponent(runId)}/logs/${name}`)
export const getTraceLlm = (runId, limit = 200) =>
  get(`/traces/${encodeURIComponent(runId)}/llm?limit=${limit}`)
export const getTraceArtifacts = (runId, canon) =>
  get(`/traces/${encodeURIComponent(runId)}/artifacts/${encodeURIComponent(canon)}`)
