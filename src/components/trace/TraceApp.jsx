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
import LlmCall from './LlmCall.jsx'
import TraceSignIn from './TraceSignIn.jsx'
import StageModal from './StageModal.jsx'

const THEME_KEY = 'taskbuilder.trace.theme'

// Stale-while-revalidate for the run list.
//
// sessionStorage, not localStorage: this is a debugging aid, and a list of runs
// that outlives the tab would be shown to whoever opens it next on a shared
// machine — the same reason the page needs a token in the first place. Per-tab
// and gone on close is the right lifetime.
//
// The cached list is shown IMMEDIATELY and always revalidated behind it. It is
// never the answer, only the first paint: a run listed here may have been
// archived over, and the fresh list replaces it within a second.
const RUNS_CACHE_KEY = 'taskbuilder.trace.runs.v1'

function readCachedRuns() {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(RUNS_CACHE_KEY) || 'null')
    // Anything but a non-empty array is treated as no cache — a half-written or
    // schema-changed entry must not render as an empty run list.
    return Array.isArray(parsed) && parsed.length ? parsed : null
  } catch {
    return null
  }
}

function writeCachedRuns(runs) {
  try {
    if (Array.isArray(runs) && runs.length) {
      sessionStorage.setItem(RUNS_CACHE_KEY, JSON.stringify(runs))
    }
  } catch {
    // Quota or private mode. The cache is a nicety; losing it costs a slower
    // first paint and nothing else.
  }
}

function clearCachedRuns() {
  try { sessionStorage.removeItem(RUNS_CACHE_KEY) } catch { /* ignore */ }
}
const asList = (v) => (Array.isArray(v) ? v : typeof v === 'string' && v.trim() ? [v] : [])
const runLabel = (r) => asList(r.competencies).join(', ') || String(r.run_id).slice(0, 12)

const bareStage = (n) => String(n).replace(/^\d+_/, '')
const secs = (ms) => (ms == null ? '' : ms < 1000 ? `${ms}ms` : `${Math.round(ms / 1000)}s`)

/** A pipeline run is routinely 10+ minutes, and "758s" is not a duration
 *  anyone reads at a glance. */
function fmtDuration(seconds) {
  const s = Math.round(seconds)
  if (s < 60) return `${s}s`
  return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`
}

/** The five pipeline stages — the worker's subprocesses, the only things that
 *  write logs. `canon` MUST equal `row.stage`, which parseLog sets from the log
 *  filename stem ("03_prompt"), or clicking a stage filters the pane to nothing.
 *
 *  Outcome comes from the stage's OWN `NN_stage.timing.json` (exit_code +
 *  duration_s), not from stages.jsonl. timing.json is written per subprocess and
 *  always present; stages.jsonl is the tracing sink's span log, which names
 *  things differently and has no entry at all for stages that make no LLM calls
 *  — that is why preflight and tasks used to read "no outcome" on a run that
 *  plainly succeeded. */
function deriveStages(run, timings, costs) {
  // Numeric prefixes make a plain sort the pipeline order.
  const stems = [...new Set((run?.logs || []).map(stageOfLog))].sort()
  return stems.map((n) => {
    const t = timings?.[n]
    return {
      canon: n,
      label: n,
      ok: t && t.exit_code != null ? t.exit_code === 0 : null,
      meta: t?.duration_s != null ? `${Math.round(t.duration_s)}s` : t ? '' : 'no outcome',
      usd: costs?.[bareStage(n)]?.usd,
    }
  })
}

/** Instrumented spans that ran INSIDE a stage — classifier, task_gen, eval,
 *  gate, quality, solution all execute within 04_tasks. They emit no logs of
 *  their own by construction, so they are deliberately kept out of the stage
 *  list (which is a log filter) and shown as a timing breakdown instead. Spans
 *  whose name matches a real stage are dropped: that is the stage, not a span
 *  within it. */
function deriveSpans(run) {
  const stems = new Set((run?.logs || []).map(stageOfLog).map(bareStage))
  return (run?.stages || [])
    .filter((s) => s.stage && !stems.has(bareStage(s.stage)))
    .map((s) => ({
      name: s.stage,
      ms: s.duration_ms ?? null,
      ok: s.status !== 'failed' && !s.error,
      error: s.error || '',
    }))
}

export default function TraceApp() {
  const [theme, setTheme] = useState(() => localStorage.getItem(THEME_KEY) || 'dark')
  // Seeded from the cache so the list is on screen before the first fetch
  // resolves. `loadingRuns` starts false in that case — skeletons over a
  // list we already have would be a downgrade, not a loading state.
  const [runs, setRuns] = useState(readCachedRuns)
  const [runQuery, setRunQuery] = useState('')
  const [sel, setSel] = useState(null)
  const [run, setRun] = useState(null)
  const [rows, setRows] = useState([])
  const [llm, setLlm] = useState([])
  const [timings, setTimings] = useState({})
  const [spanFilter, setSpanFilter] = useState('')
  const [needsAuth, setNeedsAuth] = useState(false)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [loadingRuns, setLoadingRuns] = useState(() => readCachedRuns() === null)
  const [loadingMore, setLoadingMore] = useState(false)
  const [openStage, setOpenStage] = useState(null)

  // log pane controls
  const [query, setQuery] = useState('')
  const [level, setLevel] = useState('')
  const [stageFilter, setStageFilter] = useState('')
  const [compact, setCompact] = useState(false)
  const [autoScroll, setAutoScroll] = useState(true)
  const logBodyRef = useRef(null)

  useEffect(() => { localStorage.setItem(THEME_KEY, theme) }, [theme])

  // Two phases, because the two halves of this list cost wildly different
  // amounts. Indexed runs come from one query; the rest need a bucket walk with
  // a manifest read per run. Waiting for the slow half before showing anything
  // meant staring at skeletons for seconds to reach a list whose top entries
  // were ready almost immediately.
  //
  // So: a small first page paints, and the full list arrives behind it. The
  // second call re-fetches the first twenty — deliberately, because a
  // cursor-based fetch would need the walk to be resumable across day
  // partitions, and duplicating twenty rows in the background is far cheaper
  // than that machinery. Nobody is waiting on it.
  const FIRST_PAGE = 20
  const FULL_PAGE = 200

  const loadRuns = useCallback(async () => {
    setErr(''); setNeedsAuth(false); setLoadingMore(false)
    // Only show skeletons when there is nothing to show instead.
    const hadCache = readCachedRuns() !== null
    if (!hadCache) setLoadingRuns(true)
    let first
    try {
      first = (await listTraces(FIRST_PAGE, { indexedOnly: true })).runs || []
      setRuns(first)
    } catch (e) {
      if (e instanceof TraceAuthError) { setNeedsAuth(true); clearCachedRuns() }
      else setErr(String(e.message || e))
      // Keep a cached list on a transient failure — it is stale, not wrong, and
      // better than an empty page. Only blank it when there was nothing cached.
      if (!hadCache) setRuns([])
      return
    } finally {
      setLoadingRuns(false)
    }

    // Phase 1 is index-only, so it is never the whole list — the walk still
    // has to run for anything archived before the index existed.

    setLoadingMore(true)
    try {
      const all = (await listTraces(FULL_PAGE)).runs || []
      // Only replace if it is genuinely a superset; a smaller result means
      // something went wrong upstream and the first page is the better answer.
      if (all.length >= first.length) {
        setRuns(all)
        // Cache the FULL list, never the index-only first page — otherwise the
        // next visit paints 14 runs and looks like the rest were lost.
        writeCachedRuns(all)
      }
    } catch {
      // Keep the first page. Failing to load OLDER runs is not worth taking
      // away the ones already on screen.
    } finally {
      setLoadingMore(false)
    }
  }, [])

  useEffect(() => { loadRuns() }, [loadRuns])

  // Load one run: detail, then every log file, then the LLM calls. The logs are
  // fetched in parallel — a run has a handful of small objects, and doing them
  // in sequence made selecting a run feel broken.
  const loadRun = useCallback(async (runId) => {
    setBusy(true); setRun(null); setRows([]); setLlm([]); setTimings({})
    setStageFilter(''); setSpanFilter('')
    try {
      const d = await getTrace(runId)
      setRun(d)
      // Logs may live under a DIFFERENT id: one generation is archived as two
      // S3 folders (worker writes logs, tracing sink writes the manifest), and
      // the backend links them via generation_jobs. log_run_id says which
      // folder actually holds the files.
      const logId = d.log_run_id || runId
      // exit_code + duration per stage now arrive WITH the detail. They used to
      // be one extra request each, which pushed a run load past the route's own
      // rate limit — the two that 429'd were then indistinguishable from stages
      // that never reported an outcome.
      setTimings(d.timings || {})
      const fetched = await Promise.all(
        (d.logs || []).filter((n) => !n.endsWith('.timing.json'))
          .map((n) => getTraceLog(logId, n)
            .then((r) => [n, r.text, null])
            .catch((e) => [n, '', e])),
      )
      setRows(fetched.flatMap(([n, t]) => parseLog(n, t)))
      // Say which logs failed. Silently rendering a short log as if it were
      // complete is the worst outcome on a page whose whole job is fidelity.
      const failed = fetched.filter(([, , e]) => e).map(([n]) => n)
      if (failed.length) {
        setErr(`${failed.length} log file(s) failed to load: ${failed.join(', ')}`)
      }
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

  // Cost + wall time keyed by BARE stage name, so both the stage rows
  // ("03_prompt") and the span pills ("task_gen") can look themselves up.
  const costByStage = useMemo(() => {
    const m = {}
    for (const r of run?.cost?.by_stage || []) m[bareStage(r.stage)] = r
    return m
  }, [run])

  // Total wall time is the SUBPROCESS timings, not the sum of span durations:
  // spans nest inside stages, so adding those would double-count.
  const totalSeconds = useMemo(
    () => Object.values(timings).reduce((n, t) => n + (t?.duration_s || 0), 0),
    [timings],
  )

  // The repo URL is not in the manifest — stage 04 prints it, and we already
  // have every log line in memory, so read it from there rather than adding a
  // lookup. Absent on a failed run, which is correct: no repo was created.
  const repoUrl = useMemo(() => {
    for (const r of rows) {
      const m = /GitHub Repository:\s*(https:\/\/\S+)/.exec(r.text || '')
      if (m) return m[1]
    }
    return ''
  }, [rows])

  const stages = useMemo(() => deriveStages(run, timings, costByStage), [run, timings, costByStage])
  const spans = useMemo(() => deriveSpans(run), [run])
  // The stage list keys on the log stem ("03_prompt"); llm_calls record the
  // bare name ("prompt"). Selecting either narrows the feed to that unit.
  const shownLlm = useMemo(() => {
    const want = spanFilter || (stageFilter ? bareStage(stageFilter) : '')
    return want ? llm.filter((c) => bareStage(c.stage || '') === want) : llm
  }, [llm, spanFilter, stageFilter])
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
        <div className="tr-signin">
          <h1>Pipeline traces</h1>
          <p>
            Utkrusht team only — this page shows full run logs and the LLM
            prompts behind every generated task.
          </p>
          <TraceSignIn onSignedIn={() => { setNeedsAuth(false); loadRuns() }} />
          {/* Kept as a fallback, not the headline: Google verifies WHO you are,
              a pasted token only proves someone could sign one. Still needed
              when GIS cannot load, or on an origin not registered with the
              OAuth client. */}
          <button type="button" className="tr-signin-alt"
                  onClick={() => { if (promptForJwt()) { setNeedsAuth(false); loadRuns() } }}>
            {getJwt() ? 'Use a different token' : 'Paste a testmaker token instead'}
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
        <span className={`tr-conn ${busy || loadingRuns || loadingMore ? '' : 'live'}`}>
          {loadingRuns ? 'loading runs'
            : busy ? 'loading run'
              : loadingMore ? 'loading older' : 'idle'}
        </span>
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
          <div className="tr-pane-head">
            {sel ? 'Stages' : loadingRuns ? 'Runs…' : `Runs (${visibleRuns.length})`}
          </div>
          <div className="tr-pane-body">
            {/* Listing is a multi-second S3 walk. Skeleton rows rather than a
                word, so the pane holds its shape and reads as filling in. */}
            {!sel && loadingRuns && Array.from({ length: 7 }, (_, i) => (
              <div className="tr-stage tr-skeleton" key={i} aria-hidden="true">
                <span className="tr-dot" />
                <span className="tr-skel-bar" style={{ width: `${70 - i * 6}%` }} />
              </div>
            ))}
            {!sel && !loadingRuns && !visibleRuns.length && (
              <div className="tr-empty">
                {runQuery ? 'No runs match that search.' : 'No archived runs yet.'}
              </div>
            )}
            {!sel && !loadingRuns && loadingMore && (
              <div className="tr-empty tr-pulse" style={{ fontSize: 11 }}>
                loading older runs…
              </div>
            )}
            {!sel && !loadingRuns && visibleRuns.map((r) => (
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
                    <span className="tr-stage-meta">
                      {s.meta}
                      {s.usd != null && <span className="tr-usd"> ${s.usd.toFixed(2)}</span>}
                    </span>
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
                {sel && busy && <div className="tr-empty tr-pulse">Fetching this run’s logs…</div>}
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
            {/* `sel` is set before `run` arrives, so this must distinguish
                "nothing picked" from "picked, still fetching" — otherwise the
                pane claims no run is selected while one is loading. */}
            {!run && !sel && <div className="tr-empty">No run selected.</div>}
            {!run && sel && <div className="tr-empty tr-pulse">Loading run…</div>}
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
                    {run.manifest?.task_name && (
                      <><dt>name</dt><dd>{run.manifest.task_name}</dd></>
                    )}
                    <dt>stack</dt><dd>{asList(run.manifest?.competencies).join(', ') || '—'}</dd>
                    <dt>env</dt><dd>{run.manifest?.env || '—'}</dd>
                    {/* Wall time across the five subprocesses. Spans nest inside
                        them, so summing spans instead would double-count. */}
                    {totalSeconds > 0 && (
                      <><dt>time</dt><dd>{fmtDuration(totalSeconds)}</dd></>
                    )}
                    {run.cost && (
                      <>
                        <dt>cost</dt>
                        <dd>
                          ${run.cost.total_usd.toFixed(2)}
                          <span className="tr-faint"> est.</span>
                        </dd>
                        <dt>tokens</dt>
                        <dd>
                          {run.cost.total_tokens.toLocaleString()}
                          <span className="tr-faint">
                            {' '}({run.cost.input_tokens.toLocaleString()} in
                            {' / '}{run.cost.output_tokens.toLocaleString()} out)
                          </span>
                        </dd>
                      </>
                    )}
                    {/* Only exists once stage 04 has actually created it, so
                        its absence on a failed run is the truth, not a gap. */}
                    {repoUrl && (
                      <>
                        <dt>repo</dt>
                        <dd>
                          <a href={repoUrl} target="_blank" rel="noopener noreferrer">
                            {repoUrl.replace('https://github.com/', '')}
                          </a>
                        </dd>
                      </>
                    )}
                  </dl>
                </div>
              </div>
            )}
            {/* Spans that ran inside a stage. They write no logs of their own,
                so they belong here — as a time breakdown of where a stage
                actually went — rather than in the stage list, where they would
                look like log-bearing stages that lost their logs. */}
            {spans.length > 0 && (
              <div className="tr-card">
                <div className="tr-card-head">
                  <span>Spans inside stages</span>
                  {spanFilter && (
                    <button type="button" className="tr-btn" onClick={() => setSpanFilter('')}>
                      clear
                    </button>
                  )}
                </div>
                <div className="tr-card-body">
                  <div className="tr-spans">
                    {spans.map((s) => (
                      <button type="button" key={s.name}
                              className={`tr-span ${spanFilter === s.name ? 'on' : ''} ${s.ok ? '' : 'err'}`}
                              title={s.error || `${s.name} — filter the calls below`}
                              onClick={() => setSpanFilter(spanFilter === s.name ? '' : s.name)}>
                        <span className="tr-span-name"
                              style={{ '--stage-color': stageHue(s.name) }}>{s.name}</span>
                        <span className="tr-span-ms">
                          {secs(s.ms)}
                          {costByStage[s.name]?.usd
                            ? ` · $${costByStage[s.name].usd.toFixed(2)}`
                            : ''}
                        </span>
                      </button>
                    ))}
                  </div>
                  <div className="tr-faint-note">
                    No logs of their own — these run inside a stage. Click one to
                    filter the calls below.
                  </div>
                </div>
              </div>
            )}
            {run && llm.length === 0 && (
              <div className="tr-empty">
                No LLM calls captured — tracing was off for this run
                (PIPELINE_TRACING_ENABLED). Stage logs are archived regardless.
              </div>
            )}
            {run && llm.length > 0 && shownLlm.length === 0 && (
              <div className="tr-empty">
                No calls recorded for that selection — {llm.length} in this run.
              </div>
            )}
            {shownLlm.map((c, i) => <LlmCall call={c} key={c.trace_id || i} />)}
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
