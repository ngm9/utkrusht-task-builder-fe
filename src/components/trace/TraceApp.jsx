// The trace viewer — a port of utkrusht-task/trace_ui's three-pane layout.
//
//   240px  |  1fr   |  380px
//   stages |  logs  |  result + LLM traces
//
// Differences from the original, all forced by where the data now lives:
//   * no SSE — the backend deliberately has no stream (it would pin a sync
//     gunicorn worker), so this loads an archived run rather than tailing one
//   * no "+ New run" / resume — those START pipelines; the chat app owns that
//   * logs arrive as whole S3 objects, so logModel reconstructs the line stream
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import './traceTheme.css'
import {
  TraceAuthError,
  getTrace,
  getTraceLlm,
  getTraceLog,
  listTraces,
} from '../../traceApi.js'
import { getJwt, promptForJwt } from '../../auth.js'
import { LEVELS, parseLog, rowMatches, stageHue, stageOfLog } from './logModel.js'
import StageModal from './StageModal.jsx'

const THEME_KEY = 'taskbuilder.trace.theme'
const asList = (v) => (Array.isArray(v) ? v : typeof v === 'string' && v.trim() ? [v] : [])
const runLabel = (r) => asList(r.competencies).join(', ') || String(r.run_id).slice(0, 12)

/** The log files name the stages; stages.jsonl only says how they ended.
 *
 *  Two details this has to respect, both learned the hard way:
 *   - `canon` MUST equal `row.stage`, which parseLog sets from the log filename
 *     stem ("03_prompt"). The jsonl records use the bare name ("prompt"), so
 *     listing those verbatim gave a sidebar entry that filtered the log pane to
 *     nothing, and listing BOTH showed one stage twice.
 *   - A stage writes its jsonl record when it FINISHES, so the stage that
 *     crashed the run has logs and no record — exactly the one you opened this
 *     page to read. It must appear, and must not claim it succeeded. */
function deriveStages(run) {
  const bare = (n) => String(n).replace(/^\d+_/, '')
  const byBare = new Map()
  ;(run?.stages || []).forEach((s, i) => byBare.set(bare(s.stage || s.label || `stage_${i}`), s))

  const outcome = (s) => (s.exit_code != null ? s.exit_code === 0 : s.status !== 'failed')
  const took = (s) =>
    s.duration_s != null ? `${s.duration_s}s`
      : s.duration_ms != null ? `${Math.round(s.duration_ms / 1000)}s`
        : ''

  // Numeric prefixes make a plain sort the pipeline order.
  const stems = [...new Set((run?.logs || []).map(stageOfLog))].sort()
  const seen = new Set()
  const stages = stems.map((n) => {
    const s = byBare.get(bare(n))
    if (s) seen.add(bare(n))
    return { canon: n, label: n, ok: s ? outcome(s) : null, meta: s ? took(s) : 'no outcome' }
  })
  // A recorded stage that archived no logs still belongs in the list.
  for (const [k, s] of byBare) {
    if (seen.has(k)) continue
    const name = s.stage || s.label || k
    stages.push({ canon: name, label: name, ok: outcome(s), meta: 'no logs' })
  }
  return stages
}

export default function TraceApp() {
  const [theme, setTheme] = useState(() => localStorage.getItem(THEME_KEY) || 'dark')
  const [runs, setRuns] = useState(null)
  const [runQuery, setRunQuery] = useState('')
  const [sel, setSel] = useState(null)
  const [run, setRun] = useState(null)
  const [rows, setRows] = useState([])
  const [llm, setLlm] = useState([])
  const [needsAuth, setNeedsAuth] = useState(false)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [openStage, setOpenStage] = useState(null)

  // log pane controls
  const [query, setQuery] = useState('')
  const [level, setLevel] = useState('')
  const [stageFilter, setStageFilter] = useState('')
  const [compact, setCompact] = useState(false)
  const [autoScroll, setAutoScroll] = useState(true)
  const logBodyRef = useRef(null)

  useEffect(() => { localStorage.setItem(THEME_KEY, theme) }, [theme])

  const loadRuns = useCallback(async () => {
    setErr(''); setNeedsAuth(false)
    try {
      setRuns((await listTraces(100)).runs || [])
    } catch (e) {
      if (e instanceof TraceAuthError) setNeedsAuth(true)
      else setErr(String(e.message || e))
    }
  }, [])

  useEffect(() => { loadRuns() }, [loadRuns])

  // Load one run: detail, then every log file, then the LLM calls. The logs are
  // fetched in parallel — a run has a handful of small objects, and doing them
  // in sequence made selecting a run feel broken.
  const loadRun = useCallback(async (runId) => {
    setBusy(true); setRun(null); setRows([]); setLlm([]); setStageFilter('')
    try {
      const d = await getTrace(runId)
      setRun(d)
      // Logs may live under a DIFFERENT id: one generation is archived as two
      // S3 folders (worker writes logs, tracing sink writes the manifest), and
      // the backend links them via generation_jobs. log_run_id says which
      // folder actually holds the files.
      const logId = d.log_run_id || runId
      const texts = await Promise.all(
        (d.logs || []).filter((n) => !n.endsWith('.timing.json'))
          .map((n) => getTraceLog(logId, n).then((r) => [n, r.text]).catch(() => [n, ''])),
      )
      setRows(texts.flatMap(([n, t]) => parseLog(n, t)))
      getTraceLlm(runId).then((r) => setLlm(r.calls || [])).catch(() => {})
    } catch (e) {
      setErr(String(e.message || e))
    } finally {
      setBusy(false)
    }
  }, [])

  useEffect(() => { if (sel) loadRun(sel) }, [sel, loadRun])

  const visibleRuns = useMemo(() => {
    const q = runQuery.trim().toLowerCase()
    if (!q) return runs || []
    return (runs || []).filter((r) =>
      `${runLabel(r)} ${r.run_id} ${r.task_name || ''} ${r.outcome || ''}`.toLowerCase().includes(q))
  }, [runs, runQuery])

  const stages = useMemo(() => deriveStages(run), [run])
  const shownRows = useMemo(
    () => rows.filter((r) => rowMatches(r, { query, level, stage: stageFilter })),
    [rows, query, level, stageFilter],
  )

  // Auto-scroll unless the reader has scrolled up — same behaviour as trace_ui's
  // resume button, which exists because a log that yanks you to the bottom while
  // you are reading is unusable.
  useEffect(() => {
    const el = logBodyRef.current
    if (el && autoScroll) el.scrollTop = el.scrollHeight
  }, [shownRows, autoScroll])

  const totals = useMemo(() => {
    // Tokens are nested under `usage`, not top level — the header read 0 for
    // every run until this was checked against a real record.
    const tokens = llm.reduce((n, c) => {
      const u = c.usage || {}
      return n + (u.input_tokens || 0) + (u.output_tokens || 0)
    }, 0)
    return { calls: llm.length, tokens }
  }, [llm])

  if (needsAuth) {
    return (
      <div className="trace-root" data-theme={theme}>
        <div className="tr-empty" style={{ padding: 30 }}>
          <h1 style={{ fontSize: 15 }}>Pipeline traces</h1>
          <p>Testmaker-only — this shows full run logs and LLM prompts.</p>
          <button type="button" className="tr-btn"
                  onClick={() => { if (promptForJwt()) loadRuns() }}>
            {getJwt() ? 'Re-enter token' : 'Enter testmaker token'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="trace-root" data-theme={theme}>
      <header className="tr-header">
        <h1><span className="dot">●</span> trace_ui</h1>
        <input className="tr-search" type="search" placeholder="search runs / tasks…"
               spellCheck="false" value={runQuery}
               onChange={(e) => setRunQuery(e.target.value)} />
        <select className="tr-picker" value={sel || ''} onChange={(e) => setSel(e.target.value)}>
          <option value="">pick a run…</option>
          {visibleRuns.map((r) => (
            <option key={r.run_id} value={r.run_id}>
              {r.day} · {runLabel(r)} · {r.outcome || '?'}
            </option>
          ))}
        </select>
        <button type="button" className="tr-btn" onClick={() => { loadRuns(); if (sel) loadRun(sel) }}>↻</button>
        <span className={`tr-conn ${busy ? '' : 'live'}`}>{busy ? 'loading' : 'idle'}</span>
        <div className="tr-totals">
          <span>calls <b>{totals.calls}</b></span>
          <span>tokens <b>{totals.tokens.toLocaleString()}</b></span>
          <button type="button" className="tr-btn"
                  onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
            {theme === 'dark' ? '☀ Light' : '☾ Dark'}
          </button>
        </div>
      </header>

      {err && <div className="tr-empty">{err}</div>}

      <main className="tr-main">
        {/* LEFT — runs when nothing is selected, that run's stages once it is */}
        <div className="tr-pane">
          <div className="tr-pane-head">{sel ? 'Stages' : `Runs (${visibleRuns.length})`}</div>
          <div className="tr-pane-body">
            {!sel && visibleRuns.map((r) => (
              <button key={r.run_id} type="button" className="tr-stage"
                      onClick={() => setSel(r.run_id)}>
                <span className={`tr-dot ${r.outcome === 'created' ? 'ok' : r.outcome === 'error' ? 'err' : ''}`} />
                <span className="tr-stage-name">{runLabel(r)}</span>
                <span className="tr-stage-meta">{r.day}</span>
              </button>
            ))}
            {sel && (
              <>
                <button type="button" className="tr-stage" onClick={() => { setSel(null); setRun(null) }}>
                  <span className="tr-stage-name">← all runs</span>
                </button>
                {stages.map((s) => (
                  <button key={s.canon} type="button"
                          className={`tr-stage ${stageFilter === s.canon ? 'on' : ''}`}
                          style={{ '--stage-color': stageHue(s.canon) }}
                          onClick={() => setStageFilter(stageFilter === s.canon ? '' : s.canon)}
                          onDoubleClick={() => setOpenStage(s)}>
                    <span className={`tr-dot ${s.ok ? 'ok' : 'err'}`} />
                    <span className="tr-stage-name">{s.label}</span>
                    <span className="tr-stage-meta">{s.meta}</span>
                  </button>
                ))}
                {!!stages.length && (
                  <div className="tr-empty" style={{ fontSize: 11 }}>
                    click to filter logs · double-click to open artifacts
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* CENTRE — the log stream */}
        <div className="tr-pane">
          <div className="tr-pane-head">
            Logs
            <input className="tr-search" style={{ width: 160 }} type="search" placeholder="search…"
                   value={query} onChange={(e) => setQuery(e.target.value)} />
            <select className="tr-select" value={level} onChange={(e) => setLevel(e.target.value)}>
              <option value="">all levels</option>
              {LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
            <select className="tr-select" value={stageFilter}
                    onChange={(e) => setStageFilter(e.target.value)}>
              <option value="">all stages</option>
              {stages.map((s) => <option key={s.canon} value={s.canon}>{s.label}</option>)}
            </select>
            <button type="button" className="tr-btn" title="Toggle compact density"
                    onClick={() => setCompact(!compact)}>⊟</button>
            <span style={{ marginLeft: 'auto', fontSize: 11 }}>{shownRows.length}/{rows.length}</span>
          </div>
          <div className="tr-center-wrap">
            <div className="tr-pane-body" ref={logBodyRef}
                 onScroll={(e) => {
                   const el = e.currentTarget
                   setAutoScroll(el.scrollHeight - el.scrollTop - el.clientHeight < 40)
                 }}>
              <div className={`tr-log ${compact ? 'compact' : ''}`}>
                {!sel && <div className="tr-empty">Pick a run to see its logs.</div>}
                {sel && !rows.length && !busy && (
                  // Two archive paths write different things: the traced
                  // pipeline uploads llm_calls but no per-stage logs. Saying so
                  // beats an empty pane that reads as a failure.
                  <div className="tr-empty">
                    This run archived no stage logs — only LLM traces (see the
                    right pane). Runs archived by the worker carry logs.
                  </div>
                )}
                {sel && !!rows.length && !shownRows.length && (
                  <div className="tr-empty">No log lines match the filters.</div>
                )}
                {shownRows.map((r) => (
                  <div key={r.id} className={`tr-row ${r.level === 'error' ? 'error' : r.level === 'warn' ? 'warn' : ''}`}>
                    <span className="tr-badge" style={{ '--stage-color': stageHue(r.stage) }}>
                      {r.stage}
                    </span>
                    <span className={`tr-msg ${r.level}`}>{r.text}</span>
                  </div>
                ))}
              </div>
            </div>
            {!autoScroll && (
              <button type="button" className="tr-resume" onClick={() => setAutoScroll(true)}>
                ▼ resume auto-scroll
              </button>
            )}
          </div>
        </div>

        {/* RIGHT — result card, then the LLM trace feed */}
        <div className="tr-pane tr-right">
          <div className="tr-pane-head">Result &amp; LLM Traces</div>
          <div className="tr-pane-body">
            {!run && <div className="tr-empty">No run selected.</div>}
            {run && (
              <div className="tr-card">
                <div className="tr-card-head">
                  <span>{run.manifest?.task_name || 'Run'}</span>
                  <span className={`tr-badge-pill ${run.manifest?.outcome === 'created' ? 'ok' : run.manifest?.outcome ? 'err' : ''}`}>
                    {run.manifest?.outcome || 'unknown'}
                  </span>
                </div>
                <div className="tr-card-body">
                  <dl className="tr-kv">
                    <dt>run</dt><dd>{run.run_id}</dd>
                    {run.manifest?.task_id && (<><dt>task</dt><dd>{run.manifest.task_id}</dd></>)}
                    <dt>stack</dt><dd>{asList(run.manifest?.competencies).join(', ') || '—'}</dd>
                    <dt>env</dt><dd>{run.manifest?.env || '—'}</dd>
                  </dl>
                </div>
              </div>
            )}
            {run && llm.length === 0 && (
              <div className="tr-empty">
                No LLM calls captured — tracing was off for this run
                (PIPELINE_TRACING_ENABLED). Stage logs are archived regardless.
              </div>
            )}
            {llm.map((c, i) => (
              <div key={i} className="tr-card">
                <div className="tr-card-head">
                  <span style={{ fontFamily: 'var(--mono)' }}>{c.model || '?'}</span>
                  <span className="tr-badge-pill">{c.latency_ms != null ? `${c.latency_ms}ms` : ''}</span>
                </div>
                <div className="tr-card-body">
                  {c.call_type || ''}{c.attempt != null ? ` · attempt ${c.attempt}` : ''}
                  <details>
                    <summary style={{ cursor: 'pointer', marginTop: 4 }}>payload</summary>
                    <pre className="tr-pre">{JSON.stringify(c, null, 2)}</pre>
                  </details>
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>

      {openStage && (
        <StageModal runId={sel} logRunId={run?.log_run_id || sel}
                    stage={openStage} allLogs={run?.logs || []}
                    onClose={() => setOpenStage(null)} />
      )}
    </div>
  )
}
