import { stageHue } from './logModel.js'

// One captured LLM call in the right-hand feed.
//
// The record already carries stage, status, usage, the request AND the
// response — the first version rendered only model + latency and hid
// everything else behind a single `payload` toggle holding the raw JSON. The
// response was technically present and effectively unreadable, and there was
// no way to tell which stage a call belonged to.

const nf = new Intl.NumberFormat()

/** Whole seconds under a minute, m:ss above — 107438ms is unreadable, and a
 *  prompt-agent call routinely runs into minutes. */
function duration(ms) {
  if (ms == null) return ''
  if (ms < 1000) return `${ms}ms`
  const s = Math.round(ms / 1000)
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`
}

/** The response body as text. `raw_text` is what the tracing sink writes;
 *  fall back to the whole object so an unexpected shape still shows something
 *  rather than an empty panel. */
function responseText(response) {
  if (response == null) return ''
  if (typeof response === 'string') return response
  if (typeof response.raw_text === 'string') return response.raw_text
  return JSON.stringify(response, null, 2)
}

function Messages({ messages }) {
  return messages.map((m, i) => (
    <div className="tr-msg-block" key={i}>
      <div className="tr-msg-role">{m.role || 'message'}</div>
      <pre className="tr-pre">{typeof m.content === 'string' ? m.content : JSON.stringify(m.content, null, 2)}</pre>
    </div>
  ))
}

export default function LlmCall({ call }) {
  const messages = call.request?.messages || []
  const answer = responseText(call.response)
  const usage = call.usage || {}
  const ok = !call.status || call.status === 'ok'

  return (
    <div className="tr-card">
      <div className="tr-card-head">
        <span className="tr-call-id">
          {call.stage ? (
            <span className="tr-stage-tag" style={{ '--stage-color': stageHue(call.stage) }}>
              {call.stage}
            </span>
          ) : null}
          <span className="tr-call-model">{call.model || 'unknown model'}</span>
        </span>
        <span className={`tr-badge-pill ${ok ? 'ok' : 'err'}`}>
          {ok ? duration(call.latency_ms) : call.status}
        </span>
      </div>

      <div className="tr-card-body">
        <div className="tr-call-meta">
          {call.call_type ? <span>{call.call_type}</span> : null}
          {call.attempt != null ? <span>attempt {call.attempt}</span> : null}
          {usage.input_tokens != null || usage.output_tokens != null ? (
            <span>
              {nf.format(usage.input_tokens || 0)} in → {nf.format(usage.output_tokens || 0)} out
            </span>
          ) : null}
          {!ok && call.latency_ms != null ? <span>{duration(call.latency_ms)}</span> : null}
        </div>

        {messages.length > 0 && (
          <details>
            <summary>prompt · {messages.length} message{messages.length === 1 ? '' : 's'}</summary>
            <Messages messages={messages} />
          </details>
        )}

        {answer ? (
          <details>
            <summary>response · {nf.format(answer.length)} chars</summary>
            <pre className="tr-pre">{answer}</pre>
          </details>
        ) : (
          <div className="tr-faint-note">No response captured for this call.</div>
        )}

        {/* Kept deliberately: the shaped views above can only show fields we
            know about, and this is a debugging tool. */}
        <details>
          <summary>raw record</summary>
          <pre className="tr-pre">{JSON.stringify(call, null, 2)}</pre>
        </details>
      </div>
    </div>
  )
}
