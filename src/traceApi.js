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

/** The sign-in config (OAuth client id). Public, no JWT — it is what the page
 *  needs BEFORE it can authenticate anyone. */
export async function getSignInConfig() {
  const res = await fetch(`${API_BASE}/v2/task-builder/traces/session`)
  if (!res.ok) throw new Error(`Could not read sign-in config (${res.status}).`)
  return res.json()
}

/** Exchange a Google ID token for a trace session token.
 *
 *  The only POST here, and the only call that does NOT send a JWT — it is how
 *  one is obtained. A 403 means the Google account is real but not an Utkrusht
 *  team account, which is a different message to the user than "sign-in
 *  failed", so the server's wording is passed through rather than replaced.
 */
export async function signInWithGoogle(credential) {
  const res = await fetch(`${API_BASE}/v2/task-builder/traces/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ credential }),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.message || `Sign-in failed (${res.status}).`)
  return body   // { token, email, expires_at }
}

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

export const listTraces = (limit = 50, { indexedOnly = false } = {}) =>
  get(`/traces?limit=${limit}${indexedOnly ? '&indexed=1' : ''}`)
export const getTrace = (runId) => get(`/traces/${encodeURIComponent(runId)}`)
export const getTraceLog = (runId, name) =>
  get(`/traces/${encodeURIComponent(runId)}/logs/${name}`)
export const getTraceLlm = (runId, limit = 200) =>
  get(`/traces/${encodeURIComponent(runId)}/llm?limit=${limit}`)
export const getTraceArtifacts = (runId, canon) =>
  get(`/traces/${encodeURIComponent(runId)}/artifacts/${encodeURIComponent(canon)}`)

// Clone a FAILED run into a fresh queued job that reuses the stored prep
// (skips 00-02, re-runs prompts + generate). 404 for manifest-only runs
// that have no job row; 409 when the run isn't failed/cancelled.
export async function rerunTrace(runId) {
  const jwt = getJwt()
  const res = await fetch(
    `${API_BASE}/v2/task-builder/traces/${encodeURIComponent(runId)}/rerun`, {
      method: 'POST',
      headers: {
        'X-Token-Source': 'recruiter',
        ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}),
      },
    })
  if (res.status === 401 || res.status === 403) throw new TraceAuthError('unauthorised')
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message
    || `${res.status}`)
  return res.json()
}
