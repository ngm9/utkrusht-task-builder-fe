// ---- notify email ----------------------------------------------------------
// The address a build's completion mail goes to. Remembered across sessions so
// a returning recruiter doesn't retype it on every task — generation takes
// minutes and they usually want the same inbox each time.
const NOTIFY_EMAIL_KEY = 'taskbuilder.notifyEmail'

export function loadNotifyEmail() {
  try {
    return localStorage.getItem(NOTIFY_EMAIL_KEY) || ''
  } catch {
    return ''
  }
}

export function saveNotifyEmail(email) {
  try {
    if (email) localStorage.setItem(NOTIFY_EMAIL_KEY, email)
    else localStorage.removeItem(NOTIFY_EMAIL_KEY)
  } catch {
    // Storage unavailable (private mode / quota) — remembering the address is a
    // convenience, never a requirement. The build itself is unaffected.
  }
}

// ---- session history (left panel) -----------------------------------------
// Each conversation is archived under its own entry so the sidebar can list
// past sessions and re-open any one read-only. Keyed by the backend session id
// so re-opening the same conversation upserts in place instead of duplicating.
const SESSIONS_KEY = 'taskbuilder.sessions'
const MAX_SESSIONS = 40

export function loadSessions() {
  try {
    const a = JSON.parse(localStorage.getItem(SESSIONS_KEY) || '[]')
    return Array.isArray(a) ? a : []
  } catch {
    return []
  }
}

let sessTimer = null
let sessDisabled = false

// Persist the whole list (debounced, newest-first, capped). Kept dumb: the
// caller owns the upsert/order so history and live chat share one save path.
export function saveSessions(list) {
  if (sessDisabled) return
  clearTimeout(sessTimer)
  sessTimer = setTimeout(() => {
    try {
      localStorage.setItem(SESSIONS_KEY, JSON.stringify(list.slice(0, MAX_SESSIONS)))
    } catch (e) {
      sessDisabled = true
      // eslint-disable-next-line no-console
      console.warn('Task Builder: session history persistence disabled —', e)
    }
  }, 500)
}
