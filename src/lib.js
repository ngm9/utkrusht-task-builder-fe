// Split a scenario's free text into its three bold sections for display.
// Mirrors parseScenario() from the static UI.
export function parseScenario(text) {
  const re = /\*\*(Current Implementation|Your Task|Success Criteria):\*\*/g
  const marks = []
  let m
  while ((m = re.exec(text)) !== null) {
    marks.push({ label: m[1], start: m.index, end: re.lastIndex })
  }
  if (!marks.length) return [{ label: '', body: text.trim() }]
  const sections = []
  for (let i = 0; i < marks.length; i++) {
    const bodyStart = marks[i].end
    const bodyEnd = i + 1 < marks.length ? marks[i + 1].start : text.length
    sections.push({ label: marks[i].label, body: text.slice(bodyStart, bodyEnd).trim() })
  }
  return sections
}

let _id = 0
// Mirrors the server's check in flask_service/routes/v2/task_builder.py — one
// @, a dot in the domain, no whitespace. Deliberately permissive: this is a
// typo catcher so the user learns before waiting minutes for a build, not an
// authority on deliverability. The server validates independently.
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

export function isValidEmail(value) {
  const email = (value || '').trim()
  return email.length > 0 && email.length <= 254 && EMAIL_RE.test(email)
}

export function nextId() {
  _id += 1
  return _id
}
