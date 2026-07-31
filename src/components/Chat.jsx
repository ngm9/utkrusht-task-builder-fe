import { useEffect, useRef } from 'react'
import Markdown from './Markdown.jsx'
import BriefCard from './BriefCard.jsx'
import TaskDetailCard from './TaskDetailCard.jsx'
import RequestCard from './RequestCard.jsx'

// Chat message renderers. `messages` is the source of truth; each item has a
// `kind` (bubble | divider | stage | done | brief). Mirrors the DOM the static
// UI built imperatively.

function Row({ role, cls, children }) {
  const avatar = (
    <div className={`avatar ${role}`}>
      {role === 'user' ? 'Y' : <img src="/favicon.png" alt="Utkrusht" />}
    </div>
  )
  const bubble = <div className={`bubble ${cls || ''}`}>{children}</div>
  return (
    <div className={`row ${role === 'user' ? 'user' : 'bot'}`}>
      {role === 'user' ? (
        <>
          {bubble}
          {avatar}
        </>
      ) : (
        <>
          {avatar}
          {bubble}
        </>
      )}
    </div>
  )
}

// Collapsible per-stage log panel. `open` is driven by status transitions in
// App (running → open, ok → closed, failed → open); the <details> is otherwise
// uncontrolled so manual toggles and the print handler can open/close it.
function StageLog({ m }) {
  const detailsRef = useRef(null)
  const logRef = useRef(null)
  useEffect(() => {
    if (detailsRef.current) detailsRef.current.open = !!m.open
  }, [m.open])
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [m.log])
  return (
    <Row role="bot" cls="stage-log">
      <details ref={detailsRef}>
        <summary>{m.summary}</summary>
        <pre className="log" ref={logRef}>
          {m.log}
        </pre>
      </details>
    </Row>
  )
}

function DoneCard({ m, onHydrateTask, onShare, shareLabel }) {
  // Older done-messages (recorded before the detail card existed, or saved
  // before the fetch resolved) carry only task_id — ask App to fetch the
  // detail and patch it in, upgrading this card in place.
  const wantsHydration = m.status === 'completed' && !m.task && !!m.task_id
  useEffect(() => {
    if (wantsHydration) onHydrateTask?.(m)
  }, [wantsHydration, m, onHydrateTask])
  if (m.status !== 'completed') {
    return <Row role="bot" cls="stage failed">{m.outcome || m.detail || m.status}</Row>
  }
  // Full task detail (title / problem statement / outcomes) — the same card
  // the recruiter app shows when sharing a task with candidates.
  if (m.task) {
    return (
      <Row role="bot" cls="result-card">
        <h4>Task created</h4>
        <TaskDetailCard task={m.task} onShare={onShare} shareLabel={shareLabel} />
      </Row>
    )
  }
  // Fallback for restored transcripts / detail fetch failures.
  const rows = [
    ['Task ID', m.task_id],
    ['Name', m.task_name],
    ['Type', m.task_type],
    ['Competencies', m.competencies],
    ['Environment', m.env],
  ].filter(([, v]) => v)
  return (
    <Row role="bot" cls="result-card">
      <h4>Task created</h4>
      <div className="kv">
        {rows.map(([k, v]) => (
          <Fragment key={k} label={k} value={v} />
        ))}
        {m.task_url ? (
          <>
            <div className="k">Repository</div>
            <div className="v">
              <a href={m.task_url} target="_blank" rel="noopener">
                {m.task_url}
              </a>
            </div>
          </>
        ) : null}
      </div>
    </Row>
  )
}

function Fragment({ label, value }) {
  return (
    <>
      <div className="k">{label}</div>
      <div className="v">{value}</div>
    </>
  )
}

export default function Chat({ messages, briefUi, onHydrateTask, conversationId,
                              onShare, shareLabel }) {
  return (
    <>
      {messages.map((m) => {
        if (m.kind === 'divider') {
          return (
            <div className="divider" key={m.id}>
              {m.text}
            </div>
          )
        }
        if (m.kind === 'request') {
          return (
            <Row role="bot" cls="summary" key={m.id}>
              <RequestCard m={m} conversationId={conversationId} />
            </Row>
          )
        }
        if (m.kind === 'stage') return <StageLog m={m} key={m.id} />
        if (m.kind === 'done') {
          return <DoneCard m={m} onHydrateTask={onHydrateTask} key={m.id}
                           onShare={() => onShare?.(m)} shareLabel={shareLabel} />
        }
        if (m.kind === 'brief') {
          return (
            <Row role="bot" cls="summary brief-card" key={m.id}>
              <BriefCard m={m} ui={briefUi} />
            </Row>
          )
        }
        // bubble — animated dots while pending; bot replies render markdown,
        // user messages stay literal (don't parse the user's own text).
        return (
          <Row role={m.role} cls={m.cls} key={m.id}>
            {m.pending ? (
              <span className="thinking" aria-label="thinking">
                <span />
                <span />
                <span />
              </span>
            ) : m.role === 'bot' ? (
              <Markdown text={m.text} />
            ) : (
              m.text
            )}
          </Row>
        )
      })}
    </>
  )
}
