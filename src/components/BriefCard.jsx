import { SLOT_DEFS } from '../constants.js'

function slotValue(def, brief) {
  const v = brief ? brief[def.key] : null
  if (def.list) return (v || []).join(', ')
  if (v === null || v === undefined || v === '') return ''
  return String(v)
}

// Inline task-brief card rendered inside the chat stream. `m` is the brief
// snapshot stored on the message; `ui` carries the live handlers/state from
// App (only the latest card is kept, so the snapshot is the current brief).
export default function BriefCard({ m, ui }) {
  const { brief = {}, missing = [] } = m
  const { generating, genDisabled, onSlotClick, onGenerate, genHint } = ui

  const asking = generating ? null : missing.length ? missing[0] : null
  const totalRequired = SLOT_DEFS.filter((d) => d.required).length
  let filledRequired = 0
  const slots = SLOT_DEFS.map((def) => {
    const value = slotValue(def, brief)
    const filled = !!value
    if (filled && def.required) filledRequired += 1
    const display = filled
      ? value
      : def.fallback || (def.key === asking ? 'being asked now…' : 'not set yet')
    const clickable = filled && !generating
    return { def, filled, display, asking: def.key === asking, clickable }
  })
  const pct = (filledRequired / totalRequired) * 100

  return (
    <>
      <h4>{`Task brief — ${filledRequired} of ${totalRequired} fields`}</h4>
      <div className="progress-track" aria-hidden="true">
        <div className="progress-fill" style={{ width: `${pct}%` }} />
      </div>
      <ul className="slots">
        {slots.map((s) => (
          <li
            key={s.def.key}
            className={`${s.filled ? 'filled' : 'empty'}${s.asking ? ' asking' : ''}`}
            title={s.clickable ? `Click to change ${s.def.label.toLowerCase()}` : undefined}
            onClick={s.clickable ? () => onSlotClick(s.def) : undefined}
          >
            <div className="slot-label">{s.def.label}</div>
            <div className="slot-value">{s.display}</div>
          </li>
        ))}
      </ul>
      <div className="actions">
        <button className="cta" disabled={genDisabled} onClick={onGenerate}>
          Generate task →
        </button>
      </div>
      <div className="gen-hint">{genHint}</div>
    </>
  )
}
