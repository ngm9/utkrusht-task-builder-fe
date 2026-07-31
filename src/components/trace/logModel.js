// Turning archived log FILES into the line stream trace_ui rendered.
//
// trace_ui tailed a live process, so it received one line at a time already
// tagged with a stage. We read whole `.stdout` / `.stderr` objects out of S3
// after the fact, so the same classification has to be reconstructed here.
//
// classifyLine and stageHue are ports of trace_ui's originals — same level
// keywords, same generated-hue scheme — so a log looks identical to the one the
// local viewer showed.

const LEVELS = ['error', 'warn', 'ok', 'info', 'debug']

/** Level of a log line, by keyword. Order matters: a line saying "ERROR ...
 *  recovered" is an error first. */
export function classifyLine(text) {
  const t = text.toLowerCase()
  if (/\b(error|exception|traceback|failed|fatal|critical)\b/.test(t)) return 'error'
  if (/\b(warn|warning|deprecat|retry|retrying|skipped)\b/.test(t)) return 'warn'
  if (/\b(ok|done|success|completed|passed|created|ready)\b/.test(t)) return 'ok'
  if (/\b(debug|trace)\b/.test(t)) return 'debug'
  return 'info'
}

/** Stable colour per stage name — trace_ui generated hues rather than hand-
 *  picking, so a new stage never lands without a colour. */
export function stageHue(stage) {
  let h = 0
  for (let i = 0; i < stage.length; i += 1) h = (h * 31 + stage.charCodeAt(i)) % 360
  return `hsl(${h} var(--stage-sat) var(--stage-l))`
}

/** `03_prompt.stderr` -> `03_prompt`. */
export function stageOfLog(name) {
  return String(name).replace(/\.(stdout|stderr|timing\.json)$/, '')
}

/** A log file's text -> rows. `stream` distinguishes stderr, which trace_ui
 *  showed as its own signal rather than folding into stdout. */
export function parseLog(name, text) {
  const stage = stageOfLog(name)
  const stream = name.endsWith('.stderr') ? 'stderr' : 'stdout'
  return String(text || '')
    .split('\n')
    .filter((l) => l.trim() !== '')
    .map((line, i) => ({
      id: `${name}:${i}`,
      stage,
      stream,
      text: line,
      // stderr is not automatically an error — plenty of tools log progress
      // there — but a stderr line that *looks* like one outranks stdout.
      level: classifyLine(line),
    }))
}

/** Filter predicate shared by the pane and its counters. */
export function rowMatches(row, { query, level, stage }) {
  if (level && row.level !== level) return false
  if (stage && row.stage !== stage) return false
  if (query) {
    const q = query.toLowerCase()
    if (!row.text.toLowerCase().includes(q) && !row.stage.toLowerCase().includes(q)) return false
  }
  return true
}

export { LEVELS }
