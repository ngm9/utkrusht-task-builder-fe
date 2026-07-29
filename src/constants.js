export const GREETING =
  "Hi! I'll help you put together a coding assessment. " +
  'First — what tech stack should the candidate work in?'

// Mirrors task_builder/slots.py: five required slots. scenario_count is
// handled automatically by the pipeline, so it's not shown in the brief panel.
// `question` is what the brief shows for the slot currently being asked, instead
// of a status label like "being asked now". Someone scanning the card should see
// the question they need to answer, phrased the way a person would ask it.
//
// `domain` keeps its key (the backend slot is `domain`) but reads as "Industry":
// it is the word a recruiter recognises without translating.
export const SLOT_DEFS = [
  { key: 'competencies', label: 'Tech stack', list: true, required: true,
    question: 'Which tech stack should the candidate work in?' },
  { key: 'proficiency', label: 'Proficiency', required: true,
    question: 'What level — basic, intermediate or advanced?' },
  { key: 'role', label: 'Role', required: true,
    question: 'What role are you hiring for?' },
  { key: 'focus_areas', label: 'Focus areas', list: true, required: true,
    question: 'What focus areas would you like to assess?' },
  { key: 'domain', label: 'Industry', required: true,
    question: 'Which industry should the scenario be set in?' },
]

export const PIPELINE_STAGES = [
  ['00_preflight', 'Preflight checks'],
  ['01_input_files', 'Input files'],
  ['02_scenarios', 'Scenarios'],
  ['03_prompt', 'Prompts'],
  ['04_tasks', 'Generate & evaluate'],
]

export const PREP_STAGES = [
  ['00_preflight', 'Preflight checks'],
  ['01_input_files', 'Input files'],
  ['02_scenarios', 'Scenarios'],
]

// Step 1 of the generate wizard — "Suggested instructions". Each selected chip
// appends its `directive` to the free-text instructions sent to the pipeline.
// `auto` contributes nothing (let the pipeline choose).
export const SERVICE_CHIPS = [
  { id: 'auto', label: 'Auto — pick a fitting service', directive: '' },
  { id: 'vectordb', label: 'Vector DB (pgvector / Qdrant)', directive: 'Require a vector database (pgvector or Qdrant) as a dependency.' },
  { id: 'redis', label: 'Redis (cache / idempotency)', directive: 'Require a Redis dependency for caching / idempotency.' },
  { id: 'kafka', label: 'Kafka (event-driven)', directive: 'Make it event-driven with a Kafka dependency.' },
  { id: 'postgres', label: 'PostgreSQL (relational)', directive: 'Require a PostgreSQL relational database.' },
  { id: 'mcp', label: 'MCP / tool server', directive: 'Require an MCP / tool-server component.' },
]

// "Task shape & focus" — orthogonal directives that shape the task.
export const SHAPE_CHIPS = [
  { id: 'debug', label: 'Make it a debugging task', directive: 'Make it a debugging task — the candidate fixes existing broken code.' },
  { id: 'greenfield', label: 'Greenfield build', directive: 'Make it a greenfield build — the candidate implements from scratch.' },
  { id: 'perf', label: 'Add a performance constraint', directive: 'Add a performance constraint the solution must satisfy.' },
  { id: 'tests', label: 'Require unit tests', directive: 'Require the candidate to write unit tests.' },
]

// Right-panel default skills — 9 famous ones (all exist in the dev DB). The
// full ~331-skill list is reachable via the search box.
export const FAMOUS_SKILLS = [
  'Python',
  'TypeScript',
  'Java',
  'Golang',
  'PostgreSQL',
  'Docker',
  'Kubernetes',
  'MongoDB',
  'Redis',
]

// Right-panel "Suggested roles" — curated, click-to-prefill the composer.
// Static on purpose: roles are a small fixed vocabulary, not DB-driven.
export const ROLE_SUGGESTIONS = [
  'Frontend Engineer',
  'Backend Engineer',
  'Full-stack Engineer',
  'Data Engineer',
  'ML / AI Engineer',
  'DevOps / Platform Engineer',
  'Mobile Engineer',
  'QA / SDET',
]

// Quick-start stacks for the right panel (prefill the composer with a stack).
export const POPULAR_STACKS = [
  'React + TypeScript',
  'Node.js + PostgreSQL',
  'Python + FastAPI',
  'Java + Spring Boot',
  'Java + Kafka',
  'Go + gRPC',
  'Django + Redis',
  'Next.js + Prisma',
  'Spring Boot + Kafka',
  'FastAPI + PostgreSQL',
  'Rust + Actix',
  'NestJS + MongoDB',
  'Ruby on Rails',
  'Kubernetes + Docker',
  'React + GraphQL',
]

// Written in the first person on purpose: "I want a…" signals that this is a
// conversation, not a form to fill in. They double as example ANSWERS to the
// greeting's question, so they also show the three proficiency levels.
//
// The STACK NAMES here must match the competency catalogue exactly, and must not
// name external infra. Two of the previous three were quietly broken:
//
//   "React"        -> the catalogue calls it ReactJs, so React matched nothing
//                     and was dropped in silence; the chip promised React and
//                     built a TypeScript-only task.
//   "Java + Kafka" -> Kafka is an external service, so the bot's own infra
//                     guardrail fired and it backpedalled ("Kafka requires an
//                     infra template…") on the very first click.
//
// Verified against the live catalogue and by replaying each line through the
// chat. If you edit these, replay them — a wrong stack name fails silently.
export const STARTERS = [
  'I want an intermediate ReactJs + TypeScript task for a frontend engineer, focused on state management, in e-commerce',
  'I want a basic Java task for a backend engineer, focused on error handling, in logistics',
  'I want an advanced Python task for a data engineer, focused on data validation, in fintech',
]
