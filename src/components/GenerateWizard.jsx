import { useEffect, useState } from 'react'
import { SERVICE_CHIPS, SHAPE_CHIPS } from '../constants.js'
import { isBusinessEmail, isValidEmail, parseScenario } from '../lib.js'
import TaskDetailCard from './TaskDetailCard.jsx'

function ChipToggle({ on, label, onClick }) {
  return (
    <button type="button" className={`wz-chip${on ? ' on' : ''}`} onClick={onClick}>
      <span className="wz-box" aria-hidden="true">
        {on ? '✓' : ''}
      </span>
      <span>{label}</span>
    </button>
  )
}

function inlineCode(text, keyBase) {
  return text.split('`').map((p, i) =>
    i % 2 ? <code key={`${keyBase}-${i}`}>{p}</code> : <span key={`${keyBase}-${i}`}>{p}</span>
  )
}

function ScenarioText({ text }) {
  return parseScenario(text).map((sec, j) => (
    <span className="wz-sc-sec" key={j}>
      {sec.label ? <b>{sec.label}: </b> : null}
      {inlineCode(sec.body, j)}
    </span>
  ))
}

function StageDot({ status }) {
  if (status === 'running') return <span className="spin" aria-hidden="true" />
  return <span className="dot">{status === 'ok' ? '✓' : status === 'failed' ? '✗' : ''}</span>
}

// Preflight → input files → scenarios, shown INLINE with live logs so you can
// watch the input files being generated (no modal, since this takes a while).
function PrepProgress({ prepStages, showLogs = true }) {
  return (
    <div className="prep-stages">
      {prepStages.map((s) => (
        <div className={`prep-stage ${s.status}`} key={s.key}>
          <div className="prep-stage-head">
            <StageDot status={s.status} />
            <span>{s.label}</span>
          </div>
          {showLogs && s.log ? (
            <details className="prep-stage-log" open={s.status === 'running'}>
              <summary>logs</summary>
              <pre>{s.log}</pre>
            </details>
          ) : null}
        </div>
      ))}
    </div>
  )
}

// One scenario at a time with ←/→ arrows — browsing is separate from picking:
// arrows/dots change which card is shown, clicking the card selects it.
function ScenarioCarousel({ list, picked, onPick }) {
  const [idx, setIdx] = useState(0)
  useEffect(() => {
    setIdx(0)
  }, [list])
  const n = list.length
  const cur = list[Math.min(idx, n - 1)]
  const pickedIdx = list.indexOf(picked)
  return (
    <div className="wz-carousel">
      <div className="wz-carousel-head">
        <span>{`Scenario ${idx + 1} of ${n}`}</span>
        {pickedIdx >= 0 && pickedIdx !== idx ? (
          <span className="wz-picked-note">{`selected: #${pickedIdx + 1}`}</span>
        ) : null}
      </div>
      <div className="wz-carousel-row">
        <button
          type="button"
          className="wz-arrow"
          aria-label="Previous scenario"
          disabled={n < 2}
          onClick={() => setIdx((i) => (i - 1 + n) % n)}
        >
          ←
        </button>
        <button
          type="button"
          className={`wz-scenario${cur === picked ? ' on' : ''}`}
          onClick={() => onPick(cur)}
        >
          <span className="wz-radio" aria-hidden="true" />
          <span className="wz-scenario-text">
            <ScenarioText text={cur} />
          </span>
        </button>
        <button
          type="button"
          className="wz-arrow"
          aria-label="Next scenario"
          disabled={n < 2}
          onClick={() => setIdx((i) => (i + 1) % n)}
        >
          →
        </button>
      </div>
      <div className="wz-dots">
        {list.map((text, i) => (
          <button
            key={i}
            type="button"
            className={`wz-dot${i === idx ? ' cur' : ''}${text === picked ? ' picked' : ''}`}
            aria-label={`Go to scenario ${i + 1}`}
            onClick={() => setIdx(i)}
          />
        ))}
      </div>
    </div>
  )
}

export default function GenerateWizard({
  open,
  step, // 'instructions' | 'scenarios'
  subtitle,
  selectedServices,
  onToggleService,
  selectedShapes,
  onToggleShape,
  instructions,
  onInstructionsChange,
  onGenerateScenarios,
  onBack,
  scenarioStage, // { mode: 'prep'|'list'|'error', prepStages, list, error }
  pickedScenario,
  onPickScenario,
  notifyEmail,
  notifyName,
  onNotifyNameChange,
  onNotifyEmailChange,
  onBuildTask,
  buildStage, // { stages, status: 'running'|'done'|'failed', result, error }
  onBuildDone,
  onClose,
}) {
  if (!open) return null
  // A half-typed address must not start a build — the server rejects it and
  // the run never happens. Blocking here turns that into an inline correction
  // instead of a failed build. Work address only: this is the product's one
  // lead signal, so a consumer domain (gmail & co.) doesn't count.
  const emailTouched = (notifyEmail || '').trim().length > 0
  const emailMalformed = emailTouched && !isValidEmail(notifyEmail)
  const emailPersonal = emailTouched && !emailMalformed && !isBusinessEmail(notifyEmail)
  const emailInvalid = emailMalformed || emailPersonal
  // Both required — see the note on the fields below.
  const leadReady = !!(notifyName || '').trim() && isBusinessEmail(notifyEmail || '')
  return (
    <div className="wizard-inline">
      <div className="modal-head">
        <div className="modal-title">
          {step === 'instructions'
            ? 'Task instructions'
            : step === 'scenarios'
              // While the prep stages run there is nothing to pick yet — the
              // title must describe what IS happening, not a step that hasn't
              // arrived (it read as "pick a scenario" over an empty list).
              ? scenarioStage.mode === 'prep'
                ? 'Generating scenarios…'
                : 'Pick a scenario'
              : 'Building your task'}
        </div>
        <button className="modal-close" type="button" aria-label="Close" onClick={onClose}>
          ×
        </button>
      </div>

      <div className="modal-body">
        {step === 'instructions' ? (
          <div className="wizard-step">
            <div className="wz-sub">
              Optional — pick any that fit. These steer what kind of task gets built
              {subtitle ? (
                <>
                  {' '}for your <b>{subtitle}</b> brief
                </>
              ) : null}
              . Skip them all to let the pipeline decide.
            </div>

            <div className="wz-group">
              <div className="wz-group-label">Add an external service (optional)</div>
              <div className="wz-chips">
                {SERVICE_CHIPS.map((c) => (
                  <ChipToggle
                    key={c.id}
                    on={selectedServices.has(c.id)}
                    label={c.label}
                    onClick={() => onToggleService(c.id)}
                  />
                ))}
              </div>
            </div>

            <div className="wz-group">
              <div className="wz-group-label">Task shape &amp; focus (optional)</div>
              <div className="wz-chips">
                {SHAPE_CHIPS.map((c) => (
                  <ChipToggle
                    key={c.id}
                    on={selectedShapes.has(c.id)}
                    label={c.label}
                    onClick={() => onToggleShape(c.id)}
                  />
                ))}
              </div>
            </div>

            <div className="wz-group">
              <div className="wz-group-label">Or add your own instructions</div>
              <textarea
                className="instructions"
                rows="3"
                value={instructions}
                onChange={(e) => onInstructionsChange(e.target.value)}
                placeholder="e.g. Must integrate with Stripe API, focus on error handling, or any custom requirements…"
              />
            </div>

            <div className="wz-actions">
              <button className="cta" onClick={onGenerateScenarios}>
                Generate scenarios &amp; task →
              </button>
            </div>
          </div>
        ) : step === 'scenarios' ? (
          <div className="wizard-step">
            <div className="wz-sub">
              {scenarioStage.mode === 'prep'
                ? 'We are generating the scenarios. This takes about 1-2 minutes; you pick one when they are ready.'
                : 'Choose the scenario this task will be built from. It becomes part of the brief.'}
            </div>

            {scenarioStage.mode === 'prep' && (
              <PrepProgress prepStages={scenarioStage.prepStages} />
            )}

            {scenarioStage.mode === 'error' && (
              <div className="scenario-empty">
                {scenarioStage.error}
                <br />
                You can build anyway — the pipeline will auto-pick a scenario.
              </div>
            )}

            {scenarioStage.mode === 'list' &&
              (scenarioStage.list.length ? (
                <ScenarioCarousel
                  list={scenarioStage.list}
                  picked={pickedScenario}
                  onPick={onPickScenario}
                />
              ) : (
                <div className="scenario-empty">
                  No scenarios yet — build anyway and the pipeline will create and pick one.
                </div>
              ))}

            {/* Name + email are REQUIRED to build. Deliberate: the task is the
                thing of value, so crossing this line is what marks a serious
                visitor — and it is the only way we know who is using a product
                with no login. It also earns its keep for the user, since a run
                takes minutes and we can mail the result.
                The label frames it as what it is — we host and run the task, so
                we need somewhere to send it — rather than as a gate you pay to
                pass. "Unlock your task" read like a paywall on work the user
                had already done. */}
            <div className="wz-group wz-notify">
              <div className="wz-group-label">
                We’ll deploy and run this task on our infrastructure
              </div>
              <div className="wz-notify-lede">
                We just need your email so we can tell you when it’s ready to send to
                candidates.
              </div>
              <input
                className="wz-email"
                type="text"
                autoComplete="name"
                spellCheck="false"
                value={notifyName || ''}
                onChange={(e) => onNotifyNameChange(e.target.value)}
                placeholder="Name"
                aria-label="Name"
              />
              <input
                className={`wz-email${emailInvalid ? ' invalid' : ''}`}
                type="email"
                inputMode="email"
                autoComplete="email"
                spellCheck="false"
                value={notifyEmail || ''}
                onChange={(e) => onNotifyEmailChange(e.target.value)}
                placeholder="Email"
                aria-label="Email"
                aria-invalid={emailInvalid}
                aria-describedby="wz-email-hint"
              />
              <div className="wz-email-hint" id="wz-email-hint">
                {emailMalformed
                  ? 'That doesn’t look like an email address.'
                  : emailPersonal
                    ? 'Please use your work email address — personal addresses (gmail, yahoo, …) aren’t accepted.'
                    : 'Building usually takes 5-10 minutes. We’ll email you when it’s ready so you can close this tab.'}
              </div>
            </div>

            <div className="wz-actions">
              <button className="link-btn" type="button" onClick={onBack}>
                ← Back
              </button>
              <button
                className="cta"
                disabled={scenarioStage.mode === 'prep' || !leadReady}
                onClick={onBuildTask}
              >
                Build this task →
              </button>
            </div>
          </div>
        ) : (
          <div className="wizard-step">
            <div className="wz-sub">
              {buildStage.status === 'running'
                ? 'Generating your task — prompts, code generation, and evaluation.'
                : buildStage.status === 'done'
                  ? 'Your task is ready — use it in your next hiring round.'
                  : 'Generation failed.'}
            </div>

            {/* Say it out loud once the run is in flight — the whole point of
                collecting the address is that the user can walk away. */}
            {buildStage.status === 'running' && emailTouched && !emailInvalid ? (
              <div className="wz-notify-note">
                Usually 5&ndash;10 minutes. We&rsquo;ll email <b>{notifyEmail.trim()}</b> when
                it&rsquo;s done — you can close this tab.
              </div>
            ) : null}
            {buildStage.status === 'done' && emailTouched && !emailInvalid ? (
              <div className="wz-notify-note">
                A copy is on its way to <b>{notifyEmail.trim()}</b>.
              </div>
            ) : null}

            {/* Same live-log expanders the prep step gets — the poll already
                maps every stage's log tail, so hiding them here made the two
                longest stages (Prompts, Generate & evaluate) a silent spinner
                for 5-10 minutes. */}
            <PrepProgress prepStages={buildStage.stages} showLogs />

            {buildStage.status === 'done' &&
              (buildStage.result?.details ? (
                <TaskDetailCard task={buildStage.result.details} />
              ) : (
                <div className="scenario-empty">
                  ✓ Task created{buildStage.result?.task_id ? ` — ID ${buildStage.result.task_id}` : ''}.{' '}
                  <span className="task-detail-loading">Loading task details…</span>
                </div>
              ))}
            {buildStage.status === 'failed' && (
              <div className="scenario-empty">{buildStage.error}</div>
            )}

            <div className="wz-actions">
              <button className="cta" disabled={buildStage.status === 'running'} onClick={onBuildDone}>
                {buildStage.status === 'running' ? 'Building…' : 'Done'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
