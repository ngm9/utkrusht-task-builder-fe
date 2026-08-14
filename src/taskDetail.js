// Fetch the display detail of a generated task (title / problem statement /
// expected outcomes — the recruiter share-card fields).
//
// Primary source: the builder backend's GET /api/tasks/{id}, whose field
// mapping mirrors the recruiter client's transformTaskRow. Fallback: when the
// deployed backend predates that endpoint (404), read the dev `tasks` row
// straight from Supabase (anon SELECT, same credentials the skills panel
// uses) and apply the identical transform client-side. Dev env only — the
// anon key in the build is the dev project's.
import { env } from './runtime-env.js'

const API_BASE = env('VITE_API_BASE').replace(/\/+$/, '')

const SB_URL = env('VITE_SUPABASE_URL').replace(/\/+$/, '')
const SB_KEY = env('VITE_SUPABASE_ANON_KEY').trim()

const DEFAULT_TASK_TIME_MINS = 45 // recruiter SAMPLE_QUESTIONS.DEFAULT_TASK_TIME_MINS

// Every `dataset` / `dataset2` / `dataset3`... URL, ordered by numeric suffix
// (no suffix = 1). Mirrors the recruiter client's collectDatasets.
function collectDatasets(resources) {
  const found = []
  for (const [key, value] of Object.entries(resources || {})) {
    const m = /^dataset(\d*)$/.exec(key)
    if (!m || typeof value !== 'string' || !value.trim()) continue
    found.push([m[1] ? parseInt(m[1], 10) : 1, value.trim()])
  }
  return found.sort((a, b) => a[0] - b[0]).map(([, url]) => url)
}

function transformRow(row) {
  const blob = row.task_blob || {}

  let problemStatement = ''
  if (Array.isArray(blob.short_overview)) {
    problemStatement = blob.short_overview.join('\n\n')
  } else if (typeof blob.short_overview === 'string') {
    problemStatement = blob.short_overview
  } else {
    problemStatement = blob.question || ''
  }

  let outcomes = blob.outcomes || []
  if (!Array.isArray(outcomes)) outcomes = [outcomes]

  const skills = []
  const seen = new Set()
  for (const c of row.criterias || []) {
    const name = c?.name
    if (!name || seen.has(name)) continue
    seen.add(name)
    skills.push({ name, proficiency: c.proficiency || '' })
  }

  const resources = blob.resources || {}
  return {
    task_id: row.task_id,
    title: blob.title || 'Untitled Task',
    problem_statement: problemStatement,
    outcomes: outcomes.map(String),
    skills,
    time_limit_mins: row.time_for_task_mins || DEFAULT_TASK_TIME_MINS,
    resources: {
      github_gist: resources.github_gist || '',
      github_repo: resources.github_repo || '',
      datasets: collectDatasets(resources),
    },
  }
}

export async function fetchTaskDetail(taskId) {
  try {
    // `/v2/task-builder/tasks/<id>` — the route that actually exists, through
    // API_BASE like every other call. The old path was a bare `/api/tasks/<id>`,
    // which nothing routes to the backend: the dev server proxies only `/v2/*`
    // and a deployed FE serves its own origin, so the request returned
    // **index.html with status 200**. `res.ok` was therefore true, `res.json()`
    // threw on the HTML, and the throw was swallowed by the catch below — so a
    // reloaded transcript silently degraded to the bare-task-id card while the
    // detail sat one working endpoint away.
    const res = await fetch(
      `${API_BASE}/v2/task-builder/tasks/${encodeURIComponent(taskId)}`,
      { headers: { Accept: 'application/json' } },
    )
    // A 200 is not enough: an SPA fallback answers 200 with HTML. Require the
    // server to say it is JSON before trusting the body.
    if (res.ok && (res.headers.get('content-type') || '').includes('application/json')) {
      return await res.json()
    }
  } catch {
    /* fall through to the Supabase fallback */
  }
  if (!SB_URL || !SB_KEY) return null
  try {
    const url =
      `${SB_URL}/rest/v1/tasks?task_id=eq.${encodeURIComponent(taskId)}` +
      '&select=task_id,task_blob,criterias,time_for_task_mins'
    const res = await fetch(url, {
      headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
    })
    if (!res.ok) return null
    const rows = await res.json()
    return rows.length ? transformRow(rows[0]) : null
  } catch {
    return null
  }
}
