import { useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import {
  createTaskBuilderSession,
  createTaskBuilderMessage,
  getTaskBuilderScenarios,
  prepareTaskBuilderRun,
  generateTaskBuilderRun,
  getTaskBuilderRun,
} from './client.js'
import { fetchTaskDetail } from './taskDetail.js'
import { registerIds, track } from './analytics.js'
import { loadSessions, saveSessions } from './persist.js'
import { nextId } from './lib.js'
import {
  PIPELINE_STAGES,
  PREP_STAGES,
  STARTERS,
  SERVICE_CHIPS,
  SHAPE_CHIPS,
  SLOT_DEFS,
} from './constants.js'
import Header from './components/Header.jsx'
import Chat from './components/Chat.jsx'
import GenerateWizard from './components/GenerateWizard.jsx'
import HistoryPanel from './components/HistoryPanel.jsx'
import SkillsPanel from './components/SkillsPanel.jsx'

// Sidebar session title: first thing the user typed, else the brief's stack.
function deriveTitle(msgs, brief) {
  const firstUser = msgs.find((m) => m.kind === 'bubble' && m.role === 'user')
  if (firstUser?.text?.trim()) return firstUser.text.trim().slice(0, 70)
  const comps = (brief?.competencies || []).join(', ')
  return comps || 'New task'
}

const EMPTY_PANEL = { brief: {}, missing: [], ready: false }
const PREPARED_STAGES = ['00_preflight', '01_input_files', '02_scenarios']
const emptyScenarioStage = () => ({ mode: 'prep', prepStages: [], list: [], error: '' })

// The brief is generation-ready once every REQUIRED slot is filled — this is
// exactly what the backend's /api/generate gates on (brief.is_complete()). We
// deliberately do NOT wait for the bot's `ready` confirmation flag: it stays
// false until the user says "yes, confirm" in chat, which would otherwise
// leave the Generate button disabled on a fully-filled brief.
function isBriefComplete(brief) {
  if (!brief) return false
  return SLOT_DEFS.filter((d) => d.required).every((d) => {
    const v = brief[d.key]
    return d.list ? Array.isArray(v) && v.length > 0 : v != null && String(v).trim() !== ''
  })
}

export default function App() {
  // ---- render state --------------------------------------------------------
  const [messages, setMessages] = useState([])
  const [sessionId, setSessionId] = useState(null)
  const [generating, setGenerating] = useState(false)
  const [panelState, setPanelState] = useState(EMPTY_PANEL)
  const [input, setInput] = useState('')
  const [instructions, setInstructions] = useState('')
  const [showStarters, setShowStarters] = useState(false)
  const [printDate, setPrintDate] = useState('')

  // side panels
  const [sessions, setSessions] = useState(() => loadSessions())
  const [viewingId, setViewingId] = useState(null) // non-null ⇒ browsing an archived session read-only
  const [showHistory, setShowHistory] = useState(true)
  const [showSkills, setShowSkills] = useState(true)
  const liveMessagesRef = useRef(null) // stashes the live chat while viewing an archived session

  // wizard
  const [wizardOpen, setWizardOpen] = useState(false)
  const [wizardStep, setWizardStep] = useState('instructions') // 'instructions' | 'scenarios'
  const [selectedServices, setSelectedServices] = useState(new Set(['auto']))
  const [selectedShapes, setSelectedShapes] = useState(new Set())
  const [scenarioStage, setScenarioStage] = useState(emptyScenarioStage())
  const [buildStage, setBuildStage] = useState({ stages: [], status: 'running', result: null, error: '' })
  const [pickedScenario, setPickedScenario] = useState('')

  // ---- refs (read inside async fetch / SSE callbacks) ----------------------
  const sessionIdRef = useRef(null)
  const busyRef = useRef(false)
  const generatingRef = useRef(false)
  const panelStateRef = useRef(EMPTY_PANEL)
  const instructionsRef = useRef('')
  const selectedScenarioRef = useRef('')
  const scenariosPreparedRef = useRef(false)
  const inputRef = useRef('')
  const prepStreamRef = useRef(null)
  const prepTimerRef = useRef(null)
  const buildTimerRef = useRef(null)
  const inputElRef = useRef(null)
  const mainRef = useRef(null)
  const initRef = useRef(false)

  // ---- message helpers -----------------------------------------------------
  function addBubble(role, text, cls = '', pending = false) {
    const id = nextId()
    setMessages((prev) => [...prev, { id, kind: 'bubble', role, text, cls, pending }])
    return id
  }
  function addStage(label) {
    const id = nextId()
    setMessages((prev) => [
      ...prev,
      { id, kind: 'stage', label, summary: '', log: '', status: '', open: false },
    ])
    return id
  }
  function addDone(spec) {
    const id = nextId()
    setMessages((prev) => [...prev, { id, kind: 'done', ...spec }])
    return id
  }
  function patchMessage(id, patch) {
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)))
  }
  function appendLog(id, text) {
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, log: (m.log || '') + text } : m)))
  }

  // Archive the live conversation into the session history (left panel). Skipped
  // while viewing an archived session (we must not overwrite it with itself) and
  // for empty sessions. Keyed by the backend session id so it upserts in place.
  useEffect(() => {
    if (!sessionId || viewingId) return
    const content = messages.filter((m) => !m.pending && m.kind !== 'divider' && m.kind !== 'brief')
    // Only archive a session the user actually engaged with — skip greeting-only.
    if (!content.some((m) => m.kind === 'bubble' && m.role === 'user')) return
    const title = deriveTitle(content, panelStateRef.current.brief)
    const taskId = [...content].reverse().find((m) => m.kind === 'done')?.task_id || ''
    setSessions((prev) => {
      const now = Date.now()
      const existing = prev.find((s) => s.id === sessionId)
      const entry = {
        id: sessionId,
        title,
        messages: content,
        createdAt: existing?.createdAt || now,
        updatedAt: now,
        taskId: taskId || existing?.taskId || '',
      }
      const next = [entry, ...prev.filter((s) => s.id !== sessionId)]
      saveSessions(next)
      return next
    })
  }, [messages, sessionId, viewingId])

  // Keep the chat scrolled to the newest message. `main` is the scroll
  // container (overflow-y:auto) — not `.chat`, which is a flex:1 child — so
  // scroll the parent, else new replies never scroll into view.
  useEffect(() => {
    const el = mainRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages])

  // The inline generate wizard renders at the TOP of `main`. After a brief is
  // filled `main` is scrolled to the bottom, so opening the wizard would leave
  // it off-screen above the fold — the click "does nothing" from the user's
  // view. Scroll it into view whenever it opens.
  useEffect(() => {
    if (!wizardOpen) return
    const w = mainRef.current?.querySelector('.wizard-inline')
    if (w) w.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [wizardOpen])

  // ---- brief panel ---------------------------------------------------------
  function updateBrief(data) {
    const ns = {
      brief: data.brief || {},
      missing: data.missing_slots || [],
      ready: !!data.ready,
    }
    panelStateRef.current = ns
    setPanelState(ns)
    setMessages((prev) => [
      ...prev.filter((m) => m.kind !== 'brief'),
      { id: nextId(), kind: 'brief', ...ns },
    ])
  }

  // ---- conversation --------------------------------------------------------
  async function startSession() {
    try {
      const { data } = await createTaskBuilderSession()
      sessionIdRef.current = data.session_id
      setSessionId(data.session_id)
      // Tag this replay/session with the conversation id so it's searchable.
      registerIds({ conversation_id: data.session_id })
      track('session_started', { conversation_id: data.session_id })
      addBubble('bot', data.reply)
    } catch {
      addBubble('bot', 'Could not connect to the server. Is the backend running?')
    }
  }

  async function sendText(raw) {
    const text = (raw || '').trim()
    if (!text || busyRef.current || !sessionIdRef.current) return
    busyRef.current = true
    setInput('')
    inputRef.current = ''
    setShowStarters(false)
    addBubble('user', text)
    const thinkingId = addBubble('bot', '…', '', true)
    try {
      const { data } = await createTaskBuilderMessage(sessionIdRef.current, { message: text })
      patchMessage(thinkingId, { text: data.reply, pending: false })
      updateBrief(data)
    } catch {
      patchMessage(thinkingId, { text: 'Network error — please try again.', pending: false })
    } finally {
      busyRef.current = false
    }
  }
  const send = () => sendText(inputRef.current)

  // ---- generate wizard -----------------------------------------------------
  function composeInstructions() {
    const parts = []
    for (const c of SERVICE_CHIPS) if (selectedServices.has(c.id) && c.directive) parts.push(c.directive)
    for (const c of SHAPE_CHIPS) if (selectedShapes.has(c.id) && c.directive) parts.push(c.directive)
    const free = instructions.trim()
    if (free) parts.push(free)
    return parts.join('\n')
  }

  function openWizard() {
    if (!sessionIdRef.current || !isBriefComplete(panelStateRef.current.brief) || generatingRef.current)
      return
    setWizardStep('instructions')
    setWizardOpen(true)
  }
  function closeWizard() {
    if (prepStreamRef.current) {
      prepStreamRef.current.close()
      prepStreamRef.current = null
    }
    clearTimeout(prepTimerRef.current)
    clearTimeout(buildTimerRef.current)
    generatingRef.current = false
    setGenerating(false)
    setWizardOpen(false)
  }
  function toggleService(id) {
    setSelectedServices((prev) => {
      const n = new Set(prev)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })
  }
  function toggleShape(id) {
    setSelectedShapes((prev) => {
      const n = new Set(prev)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })
  }

  function onGenerateScenarios() {
    setWizardStep('scenarios')
    setScenarioStage({
      mode: 'prep',
      prepStages: PREP_STAGES.map(([key, label]) => ({ key, label, status: 'pending', log: '' })),
      list: [],
      error: '',
    })
    getTaskBuilderScenarios(sessionIdRef.current)
      .then(({ data }) => {
        const pool = (data && data.scenarios) || []
        if (pool.length) {
          scenariosPreparedRef.current = true
          setScenarioStage((prev) => ({ ...prev, mode: 'list', list: pool }))
        } else {
          runPrepare()
        }
      })
      .catch(() => runPrepare())
  }

  function runPrepare() {
    setScenarioStage((prev) => ({ ...prev, mode: 'prep' }))
    prepareTaskBuilderRun(sessionIdRef.current, {})
      .then(({ data }) => pollPrep(data.job_id))
      .catch(() =>
        setScenarioStage((prev) => ({ ...prev, mode: 'error', error: 'Could not start scenario preparation.' }))
      )
  }

  // Poll the run state (not SSE) so we can show each stage's LIVE LOG tail —
  // you watch input files being generated, right in the panel.
  function pollPrep(jobId) {
    clearTimeout(prepTimerRef.current)
    const tick = () => {
      getTaskBuilderRun(jobId)
        .then(({ data }) => {
          const byLabel = {}
          for (const s of data.stages || []) byLabel[s.label] = s
          const prep = PREP_STAGES.map(([key, label]) => {
            const s = byLabel[key] || {}
            return { key, label, status: s.status || 'pending', log: s.log || '' }
          })
          setScenarioStage((prev) => ({ ...prev, prepStages: prep }))
          const st = data.status
          if (st === 'done') {
            scenariosPreparedRef.current = true
            getTaskBuilderScenarios(sessionIdRef.current)
              .then(({ data: d }) => setScenarioStage((prev) => ({ ...prev, mode: 'list', list: (d && d.scenarios) || [] })))
              .catch(() =>
                setScenarioStage((prev) => ({
                  ...prev,
                  mode: 'error',
                  error: 'Scenarios were generated but could not be loaded.',
                }))
              )
            return
          }
          if (st === 'failed' || st === 'cancelled') {
            setScenarioStage((prev) => ({ ...prev, mode: 'error', error: data.error || 'Scenario preparation failed.' }))
            return
          }
          prepTimerRef.current = setTimeout(tick, 1500)
        })
        .catch(() => {
          prepTimerRef.current = setTimeout(tick, 2500)
        })
    }
    tick()
  }

  function onBuildTask() {
    if (generatingRef.current || !isBriefComplete(panelStateRef.current.brief) || !sessionIdRef.current)
      return
    const instr = composeInstructions()
    instructionsRef.current = instr
    selectedScenarioRef.current = pickedScenario
    generatingRef.current = true
    setGenerating(true)
    setWizardStep('building')
    setBuildStage({
      stages: PIPELINE_STAGES.map(([key, label]) => ({
        key,
        label,
        status: scenariosPreparedRef.current && PREPARED_STAGES.includes(key) ? 'ok' : 'pending',
        log: '',
      })),
      status: 'running',
      result: null,
      error: '',
    })
    generateTaskBuilderRun(sessionIdRef.current, {
      instructions: instr,
      selected_scenario: selectedScenarioRef.current,
      scenarios_prepared: scenariosPreparedRef.current,
    })
      .then(({ data }) => pollBuild(data.job_id))
      .catch(() => {
        generatingRef.current = false
        setGenerating(false)
        setBuildStage((prev) => ({ ...prev, status: 'failed', error: 'Could not start generation.' }))
      })
  }

  // Poll the generation job so ALL five stages + their logs show live in the
  // wizard — same view the prep step uses, so the pipeline doesn't vanish
  // after Build.
  function pollBuild(jobId) {
    clearTimeout(buildTimerRef.current)
    const tick = () => {
      getTaskBuilderRun(jobId)
        .then(({ data }) => {
          const byLabel = {}
          for (const s of data.stages || []) byLabel[s.label] = s
          const stages = PIPELINE_STAGES.map(([key, label]) => {
            const s = byLabel[key] || {}
            return { key, label, status: s.status || 'pending', log: s.log || '' }
          })
          setBuildStage((prev) => ({ ...prev, stages }))
          const st = data.status
          if (st === 'done') {
            generatingRef.current = false
            setGenerating(false)
            setBuildStage((prev) => ({ ...prev, status: 'done', result: { task_id: data.result_task_id, details: null } }))
            if (data.result_task_id) fetchTaskDetails(data.result_task_id)
            return
          }
          if (st === 'failed' || st === 'cancelled') {
            generatingRef.current = false
            setGenerating(false)
            setBuildStage((prev) => ({ ...prev, status: 'failed', error: data.error || 'Generation failed.' }))
            return
          }
          buildTimerRef.current = setTimeout(tick, 1500)
        })
        .catch(() => {
          buildTimerRef.current = setTimeout(tick, 2500)
        })
    }
    tick()
  }

  // The generated task's display detail (title / problem statement / expected
  // outcomes — same card the recruiter app shows when sharing a task).
  // Fetched once the build reports done; patched into buildStage.result so
  // the wizard's final step and the chat done-card can render it.
  function fetchTaskDetails(taskId) {
    fetchTaskDetail(taskId).then((details) => {
      if (!details) return
      setBuildStage((prev) =>
        prev.result?.task_id === taskId
          ? { ...prev, result: { ...prev.result, details } }
          : prev
      )
    })
  }

  // Upgrade an old chat done-card (task_id only — recorded before the detail
  // card existed, or restored from an archived session) to the full task
  // detail card. Patching the message means the archive effect re-saves it
  // with the detail, so each card is fetched at most once per session.
  const hydratedTasksRef = useRef(new Set())
  function hydrateTask(m) {
    if (!m.task_id || hydratedTasksRef.current.has(m.id)) return
    hydratedTasksRef.current.add(m.id)
    fetchTaskDetail(m.task_id).then((details) => {
      if (details) patchMessage(m.id, { task: details })
    })
  }

  // Record the outcome in the chat transcript, then close the wizard.
  function finishBuild() {
    if (buildStage.status === 'done') {
      addDone({
        status: 'completed',
        task_id: buildStage.result?.task_id || '',
        task: buildStage.result?.details || null,
        task_name: '',
        task_type: '',
        competencies: '',
        task_url: '',
        outcome: '',
        detail: '',
      })
    } else if (buildStage.status === 'failed') {
      addBubble('bot', buildStage.error || 'Generation failed.', 'stage failed')
    }
    closeWizard()
  }

  // ---- session history (left panel) ---------------------------------------
  function backToLive() {
    if (!viewingId) return
    setMessages(liveMessagesRef.current || [])
    liveMessagesRef.current = null
    setViewingId(null)
  }
  function openSession(s) {
    if (s.id === sessionId) return backToLive() // it's the live one — just return to it
    if (!viewingId) liveMessagesRef.current = messages // stash the live chat once
    setViewingId(s.id)
    setShowStarters(false)
    setWizardOpen(false)
    setMessages((s.messages || []).map((m) => ({ ...m, id: m.id ?? nextId() })))
  }
  function deleteSession(id) {
    setSessions((prev) => {
      const next = prev.filter((s) => s.id !== id)
      saveSessions(next)
      return next
    })
    if (id === viewingId) backToLive()
  }

  // Right-panel picks prefill the composer (leaving an archived view first).
  function prefill(text) {
    if (viewingId) backToLive()
    setInput(text)
    inputRef.current = text
    if (inputElRef.current) inputElRef.current.focus()
  }
  const onPickSkill = (name, prof = 'INTERMEDIATE') =>
    prefill(`Create a ${prof} ${name} task for a `)
  const onPickRole = (role) => prefill(`Create a task for a ${role} using `)
  const onPickStack = (stack) => prefill(`Create a task using ${stack} for a `)

  // ---- header actions ------------------------------------------------------
  function newTask() {
    if (!window.confirm('Discard this conversation and start a new task?')) return
    liveMessagesRef.current = null
    setViewingId(null)
    setMessages([])
    sessionIdRef.current = null
    setSessionId(null)
    busyRef.current = false
    generatingRef.current = false
    setGenerating(false)
    setInstructions('')
    instructionsRef.current = ''
    // reset wizard
    closeWizard()
    setSelectedServices(new Set(['auto']))
    setSelectedShapes(new Set())
    setPickedScenario('')
    setScenarioStage(emptyScenarioStage())
    selectedScenarioRef.current = ''
    scenariosPreparedRef.current = false
    panelStateRef.current = EMPTY_PANEL
    setPanelState(EMPTY_PANEL)
    setShowStarters(true)
    startSession()
  }

  function downloadPdf() {
    const panels = document.querySelectorAll('.stage-log details')
    const wasOpen = []
    panels.forEach((d) => {
      wasOpen.push(d.open)
      d.open = true
    })
    flushSync(() => setPrintDate(new Date().toLocaleString()))
    const restore = () => {
      panels.forEach((d, i) => {
        d.open = wasOpen[i]
      })
      window.removeEventListener('afterprint', restore)
    }
    window.addEventListener('afterprint', restore)
    window.print()
  }

  // ---- field change handlers ----------------------------------------------
  function onInputChange(v) {
    setInput(v)
    inputRef.current = v
  }
  function onSlotClick(def) {
    const v = `Change the ${def.label.toLowerCase()} to `
    setInput(v)
    inputRef.current = v
    if (inputElRef.current) inputElRef.current.focus()
  }

  // ---- one-time init: always start a fresh session ------------------------
  // Past conversations live in the History panel (localStorage sessions), so a
  // refresh no longer replays the previous chat inline — it starts clean.
  useEffect(() => {
    if (initRef.current) return
    initRef.current = true
    setShowStarters(true)
    startSession()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const genHint = generating
    ? 'Generation in progress — logs stream in the chat.'
    : isBriefComplete(panelState.brief)
      ? 'Click Generate — add optional instructions, pick a scenario, then build.'
      : 'Answer the questions in the chat — the brief fills in here as you go.'
  const genDisabled = !(isBriefComplete(panelState.brief) && sessionId && !generating)

  const briefUi = {
    generating,
    genDisabled,
    onSlotClick,
    onGenerate: openWizard,
    genHint,
  }

  const brief = panelState.brief || {}
  const wizardSubtitle = [(brief.competencies || []).join(', '), brief.role]
    .filter(Boolean)
    .join(' · ')

  return (
    <>
      <Header
        onNewTask={newTask}
        onDownloadPdf={downloadPdf}
        showHistory={showHistory}
        onToggleHistory={() => setShowHistory((v) => !v)}
        showSkills={showSkills}
        onToggleSkills={() => setShowSkills((v) => !v)}
      />
      <div className="print-head" aria-hidden="true">
        Utkrusht Task Builder — <span id="print-date">{printDate}</span>
      </div>

      <div className={`layout${showHistory ? ' with-left' : ''}${showSkills ? ' with-right' : ''}`}>
        {showHistory && (
          <HistoryPanel
            sessions={sessions}
            currentId={sessionId}
            viewingId={viewingId}
            onOpen={openSession}
            onDelete={deleteSession}
            onNew={newTask}
          />
        )}

        <main ref={mainRef}>
          {viewingId && (
            <div className="viewing-banner">
              <span>Viewing a saved session — read only.</span>
              <button type="button" className="link-btn" onClick={backToLive}>
                ← Back to current
              </button>
            </div>
          )}

          <div className="chat">
            <Chat messages={messages} briefUi={briefUi} onHydrateTask={hydrateTask} />
          </div>

          {showStarters && !wizardOpen && !viewingId && (
            <div className="starters">
              <div className="starters-label">Try one of these to get going:</div>
              <div className="starters-row">
                {STARTERS.map((t, i) => (
                  <button key={i} type="button" className="chip" onClick={() => sendText(t)}>
                    {t}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* The wizard renders BELOW the conversation so it appears down the
              page (where the user clicked Generate), not at the top. */}
          <GenerateWizard
            open={wizardOpen}
            step={wizardStep}
            subtitle={wizardSubtitle}
            selectedServices={selectedServices}
            onToggleService={toggleService}
            selectedShapes={selectedShapes}
            onToggleShape={toggleShape}
            instructions={instructions}
            onInstructionsChange={setInstructions}
            onGenerateScenarios={onGenerateScenarios}
            onBack={() => setWizardStep('instructions')}
            scenarioStage={scenarioStage}
            pickedScenario={pickedScenario}
            onPickScenario={setPickedScenario}
            onBuildTask={onBuildTask}
            buildStage={buildStage}
            onBuildDone={finishBuild}
            onClose={closeWizard}
          />

          {/* Hide the chat input while the wizard is open or while browsing an
              archived session (read-only) — no typing in either mode. */}
          {!wizardOpen && !viewingId && (
            <div className="dock">
              <div className="dock-inner">
                <input
                  type="text"
                  ref={inputElRef}
                  value={input}
                  placeholder="Type a message…"
                  autoComplete="off"
                  onChange={(e) => onInputChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') send()
                  }}
                />
                <button onClick={send}>Send</button>
              </div>
            </div>
          )}
        </main>

        {showSkills && (
          <SkillsPanel
            onPickSkill={onPickSkill}
            onPickRole={onPickRole}
            onPickStack={onPickStack}
          />
        )}
      </div>
    </>
  )
}
