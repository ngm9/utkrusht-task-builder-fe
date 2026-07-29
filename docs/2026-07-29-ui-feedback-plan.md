# Task Builder UI — plan from Zubin's review (29 Jul)

Source: 31-min Google Meet walkthrough, Zubin + Rohan.

Zubin's verdict: *"the crux, 80 percent, is really good"* and *"this is exactly the
lead magnet me and Naman were wanting."* So the work below is refinement, not
rework — with **one exception**: lead capture does not exist yet and is the
entire business reason the tool exists.

His organising principle, stated twice: **keep it minimal, give fewer options.**
Several items below are deletions.

---

## P0 — Lead capture (the point of the whole thing)

> *"What we want is leads… someone should give his name or email ID so that we
> have that as a core lead. 100 people [see a] post, probably 5 people will
> [convert]. We as a company should focus on those 5."*

**Where:** at the **build task** step, after scenarios — not at the start.
Zubin was explicit when asked "which stage?": *"Scenarios, then build task
option. So when I click on build task, pop-up should be what's your name and
email."*

**What:** a modal asking **first name** (not full name) + **email**.

**Copy he dictated:** *"Great, just enter your name and email to unlock your
task."*

### ⛔ Open decision — blocking

**Zubin wants it mandatory. Naman wants it optional.** Verbatim:

> Rohan: "So that's optional, right?"
> Zubin: "No, it's mandatory. If you've made something useful, why [give] it
> [away]? Put up some barrier and let someone cross that barrier. That's a
> serious person… **Naman is saying that you have an optional.**"
> Zubin: "Then how are we tracking? Who is using it?"

This is a product call between the two of them, not an engineering one. Build
the modal either way; the required/optional flag is one line. **Get a ruling
before shipping** — it changes the conversion funnel, not the code.

Note the tool is fully public today: no login, no rate limit beyond the
per-route API limits, unlimited conversations. The gate is the only tracking
mechanism proposed.

---

## P1 — Make it read like a chat

The single most repeated theme. The UI currently reads like a form with a chat
next to it.

### 1. Starters in the first person, three of them

Current (`constants.js:STARTERS`) — third person, reads like a spec:

```
An INTERMEDIATE React + TypeScript task for a frontend engineer, focused on…
```

Zubin: *"the answer can be **I want** an intermediate React plus TypeScript task
for a frontend engineer… those words like **I** and **you**, it really helps to
understand that this is a chat."*

Rewrite all three to start `I want a…` / `I want an…`, covering BASIC,
INTERMEDIATE, ADVANCED. Label them **example answers**.

### 2. Brief placeholders become questions

`BriefCard.jsx:26` renders `being asked now…` / `not set yet`.

Zubin: *"someone reading this… I would say **'What focus areas would you like to
assess?'** So relate to the wordings."*

Replace the status labels with the actual question for the slot being asked.
`not set yet` for the rest is fine — it is honest and short.

### 3. "Domain" → "Industry"

> *"Instead of domain you can say industry… industry is a more relevant word for
> someone to pick it up easily."*

Label only (`SLOT_DEFS`). The backend slot key stays `domain` — no API change.

### 4. Tell the user which button to press

Zubin, with a complete brief on screen: *"you want me to click Generate Task or
Send?"* — then pressed Send and nothing happened.

> *"So here, write your CTA — 'everything looks good, click on Generate task'."*

When the brief completes, the bot's message should name the button. This is a
prompt change (backend) plus possibly a visual affordance.

---

## P1 — Layout: brief above, chat below

> *"This box that [opens], you can [put it] above, and then the chat can be
> below. Put together. So when he reads this — does everything look good — he's
> tempted to reply."*

The reply affordance should sit directly under the thing being confirmed. This
is the largest structural change here and touches the main layout, so it wants
its own review — everything else in this doc is copy or a single component.

---

## P2 — Flow naming and instructions

### 5. "Generate scenarios" breaks continuity

> *"When I'm clicking Generate task and I'm suddenly seeing 'generate
> scenarios', it disconnects the user, because he is wanting to create a task…
> With continuity, just say **'Generate scenarios and the task'**."*

Rename so the button describes the outcome, not the intermediate stage.

### 6. Suggested instructions are hardcoded — the endpoint already exists

Zubin: *"these instructions are hardcoded, but these will also [be] generated
[by] LLM."* Also asked for the heading to read **"Suggested instructions
(optional)"**.

**This is already half-built.** `GET /v2/task-builder/instruction-suggestions`
works and returns stack-aware suggestions; `getTaskBuilderInstructionSuggestions`
is re-exported in `client.js` but **nothing calls it**. `GenerateWizard.jsx`
renders the fixed `SERVICE_CHIPS` / `SHAPE_CHIPS` from `constants.js`.

Today a ReactJs/TypeScript frontend brief is offered *Redis, Kafka, PostgreSQL,
MCP* — backend infra, irrelevant to the role.

Not a drop-in swap: the chips are **toggles that append a directive**; the
endpoint returns **four full sentences**. Suggested approach — dynamic
suggestions on top, keep the infra toggles below (they map to runtime templates
the LLM text cannot express), and keep the static chips as the fallback for the
endpoint's `503` soft-fail.

---

## P2 — Expectations and completion

### 7. Say how long generation takes

> *"Try to comfort the users… when you say 'building your task', typically it
> takes around four-five minutes."*

Rohan corrected this to ~10 minutes depending on E2B verification; Zubin settled
on *"typically five to seven minutes."* Recommend stating a **range** —
"usually 5–10 minutes, longer if we're verifying in a sandbox" — rather than a
single number the run often exceeds. An understated estimate is worse than none.

### 8. Warmer completion message

> *"Your task is ready — use it for your hiring interviews or assessing
> candidates. Feel free to use it for your next hiring round."*

### 9. Email-on-completion

If we captured an email at the gate, say so: we already have the notification
plumbing (`notify_email` on the generate call → outbox → notifications service).

---

## P2 — Fewer CTAs

> *"I have a Share button and you have a Download PDF. These two things only. So
> you have as few CTAs as possible."*

### 10. There is no Share button today

It needs building, and **what it produces is an open question**. From the
transcript it sounds like a task-invite link of the kind the recruiter app
already issues (`recruiter.utkrusht.ai` → share assessment). Needs a product
decision before implementation.

### 11. PDF should contain the task, not the chat

> *"So this whole chat is [in it]? … it's only useful [for] tasks."*

Confirmed in code: `index.css:498` `@media print` hides header, dock, starters,
modals and side panels — but **keeps `.chat`**, so the transcript is printed.
Scope the print stylesheet to the task card.

### 12. Header cleanup

Zubin wants the surviving actions to be Share + Download PDF, with one existing
button removed as redundant and another relabelled **"New task"**. Current
header: history toggle, new task, download PDF, skills toggle.

---

## P3 — Guided product tour

> *"If someone is here, the page will be completely black and just highlight
> it."*

Zubin suggested **Storylane** (free tier, 1 seat) for a spotlight/coach-mark
walkthrough. Third-party tool, not application code — likely a marketing task
rather than a frontend one, but it needs someone to own it.

---

## Needs clarification before work starts

The transcript is auto-generated and partly Hinglish; these did not survive it
clearly enough to act on:

1. **7:31 — "does it take a spelling error here"** — unclear whether he found a
   typo in the UI or was asking whether the chat tolerates misspellings (it
   does: it corrected "Alexer" → "Elixir" in a later test).
2. **29:51 — "But you [have] skills. You take all these skills."** — possibly
   asking to remove the skills side panel, consistent with his minimalism theme.
   Worth confirming; it is a deletion either way.
3. **What "Share" actually produces** — see item 10.
4. **12:14 — "these are guardrails pending"** — pre-existing item, unclear scope.

---

## Suggested sequence

1. **Get the mandatory-vs-optional ruling** (Zubin vs Naman) — unblocks P0.
2. **Copy-only batch** — starters, brief questions, Domain→Industry, CTA line,
   completion message, duration estimate. Low risk, high perceived improvement,
   ships in one PR.
3. **Lead-capture modal** — the business goal.
4. **Wire the suggestions endpoint** — already built server-side.
5. **PDF scoping + header cleanup** — small, self-contained.
6. **Layout inversion** — largest change, own PR, own review.
7. **Share** — after the product decision.
8. **Storylane** — parallel, non-engineering.
