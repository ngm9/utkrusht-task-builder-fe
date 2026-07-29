// Stage modal — trace_ui's Artifacts | Logs tabs.
//
// Artifacts are what the stage PRODUCED; Logs are what it printed. The
// distinction is the whole point: when a task comes out wrong, the log says
// stage 03 ran, the artifact shows the prompt it actually wrote.
import { useEffect, useState } from 'react'
import { getTraceArtifacts, getTraceLog } from '../../traceApi.js'
import { stageOfLog } from './logModel.js'

function JsonArtifact({ data }) {
  return <pre className="tr-pre">{JSON.stringify(data, null, 2)}</pre>
}

function CodeArtifact({ a }) {
  return (
    <>
      {a.meta && (
        <div className="tr-art-title">
          {Object.entries(a.meta).map(([k, v]) => `${k}: ${v}`).join('  ·  ')}
        </div>
      )}
      <pre className="tr-pre">{a.content}</pre>
    </>
  )
}

function ScenariosArtifact({ items }) {
  return (
    <>
      {items.map((s, i) => (
        // `locked` marks the scenario this run actually built from — without it
        // the pool is an undifferentiated list and you cannot tell what it chose.
        <div key={i} className={`tr-scn ${s.locked ? 'locked' : ''}`}>
          {s.locked && <b>▸ locked in for this run — </b>}
          {s.text}
        </div>
      ))}
    </>
  )
}

function Artifacts({ runId, canon }) {
  const [state, setState] = useState({ loading: true })

  useEffect(() => {
    let dead = false
    setState({ loading: true })
    getTraceArtifacts(runId, canon)
      .then((d) => !dead && setState({ loading: false, ...d }))
      .catch((e) => !dead && setState({ loading: false, error: String(e.message || e) }))
    return () => { dead = true }
  }, [runId, canon])

  if (state.loading) return <div className="tr-empty">Loading artifacts…</div>
  if (state.error) return <div className="tr-empty">{state.error}</div>
  // A reason, not an empty box: "no artifacts" and "we cannot serve these yet"
  // look identical otherwise, and only one of them is worth chasing.
  if (state.unavailable) return <div className="tr-empty">{state.unavailable}</div>
  if (!state.artifacts?.length) {
    return <div className="tr-empty">This stage produces no artifacts — see the Logs tab.</div>
  }

  return (
    <>
      {state.artifacts.map((a, i) => (
        <div key={i}>
          <div className="tr-art-title">{a.title}</div>
          {a.kind === 'json' && <JsonArtifact data={a.data} />}
          {a.kind === 'code' && <CodeArtifact a={a} />}
          {a.kind === 'scenarios' && <ScenariosArtifact items={a.items || []} />}
        </div>
      ))}
    </>
  )
}

function Logs({ runId, logRunId, logs }) {
  const [name, setName] = useState(logs[0] || null)
  const [text, setText] = useState('')

  useEffect(() => {
    if (!name) return undefined
    let dead = false
    setText('loading…')
    getTraceLog(logRunId || runId, name)
      .then((d) => !dead && setText(d.text || '(empty)'))
      .catch((e) => !dead && setText(String(e.message || e)))
    return () => { dead = true }
  }, [runId, logRunId, name])

  if (!logs.length) return <div className="tr-empty">No logs archived for this stage.</div>
  return (
    <>
      <div className="tr-tabs" style={{ padding: 0, marginBottom: 8 }}>
        {logs.map((n) => (
          <button key={n} type="button" className={`tr-tab ${name === n ? 'on' : ''}`}
                  onClick={() => setName(n)}>
            {n.split('.').slice(1).join('.') || n}
          </button>
        ))}
      </div>
      <pre className="tr-pre">{text}</pre>
    </>
  )
}

export default function StageModal({ runId, logRunId, stage, allLogs = [], onClose }) {
  const [tab, setTab] = useState('artifacts')
  const logs = allLogs.filter((n) => stageOfLog(n) === stage.canon || stageOfLog(n) === stage.label)

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="tr-overlay" onClick={onClose}>
      <div className="tr-modal" onClick={(e) => e.stopPropagation()}>
        <div className="tr-modal-head">
          <h2>{stage.label || stage.canon}</h2>
          <button type="button" className="tr-modal-close" onClick={onClose}>×</button>
        </div>
        <div className="tr-tabs">
          <button type="button" className={`tr-tab ${tab === 'artifacts' ? 'on' : ''}`}
                  onClick={() => setTab('artifacts')}>Artifacts</button>
          <button type="button" className={`tr-tab ${tab === 'logs' ? 'on' : ''}`}
                  onClick={() => setTab('logs')}>Logs {logs.length ? `(${logs.length})` : ''}</button>
        </div>
        <div className="tr-modal-body">
          {tab === 'artifacts'
            ? <Artifacts runId={runId} canon={stage.canon} />
            : <Logs runId={runId} logRunId={logRunId} logs={logs} />}
        </div>
      </div>
    </div>
  )
}
