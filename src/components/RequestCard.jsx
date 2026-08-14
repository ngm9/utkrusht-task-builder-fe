// The in-chat request form.
//
// Rendered when a chat turn comes back with `request: {kind, subject}` — the
// bot hit one of five dead-ends it cannot build (unsupported stack, an infra
// service with no runtime template, a non-coding or psychometric assessment, a
// PR/design-review task). Before this existed the bot told recruiters to email
// naman@utkrusht.ai, which meant leaving the product and retyping a brief they
// had already given the chat.
//
// The note is prefilled from `subject`, so the common case is: glance at it,
// add your email, send.
import { useState } from 'react'
import { createTaskBuilderRequest } from '../client.js'
import { loadNotifyName, saveNotifyName } from '../persist.js'

// What to ask for, per dead-end. Generic enough that an unknown kind still
// renders something sensible rather than an empty prompt.
const PROMPTS = {
  stack: 'Which stack do you need, and what should candidates build with it?',
  runtime_template: 'What should candidates actually do with this service?',
  non_coding: 'What should this assessment measure?',
  psychometric: 'What are you trying to assess?',
  review_task: 'What should the review task cover?',
}

export default function RequestCard({ m, conversationId }) {
  const request = { kind: m.kind_, subject: m.subject || '' }
  const [email, setEmail] = useState('')
  // Prefilled from the same store the Build form writes, so someone who already
  // told us their name once does not retype it here.
  const [name, setName] = useState(() => loadNotifyName())
  const [note, setNote] = useState(
    request.subject ? `We need ${request.subject}. ` : '')
  const [state, setState] = useState('idle') // idle | sending | sent | error

  async function submit(e) {
    e.preventDefault()
    setState('sending')
    const trimmedName = name.trim()
    try {
      await createTaskBuilderRequest(conversationId, {
        ...request,
        email: email.trim(),
        name: trimmedName,
        message: note.trim(),
      })
      // Only after the send succeeds: remembering a name from a request that
      // never landed would prefill the Build form from a failure.
      saveNotifyName(trimmedName)
      setState('sent')
    } catch {
      setState('error')
    }
  }

  if (state === 'sent') {
    return (
      <div className="request-card request-card--sent">
        Thanks — the team has your request. We'll get back to you at{' '}
        <strong>{email}</strong>.
      </div>
    )
  }

  // Note and address required; the name is NOT. Those two are what make a
  // request actionable — a name only makes the reply friendlier, and every
  // extra mandatory field is another reason to abandon the form.
  const disabled = state === 'sending' || !email.trim() || !note.trim()

  return (
    <form className="request-card" onSubmit={submit}>
      <div className="request-card__title">Send the team a request</div>
      <p className="request-card__prompt">
        {PROMPTS[request.kind] || 'What do you need?'}
      </p>
      <textarea
        className="request-card__note"
        value={note}
        maxLength={2000}
        rows={3}
        placeholder="A sentence or two is plenty."
        onChange={(ev) => setNote(ev.target.value)}
      />
      <input
        className="request-card__name"
        type="text"
        value={name}
        maxLength={100}
        placeholder="Your name (optional)"
        onChange={(ev) => setName(ev.target.value)}
      />
      <input
        className="request-card__email"
        type="email"
        value={email}
        placeholder="your@email.com"
        onChange={(ev) => setEmail(ev.target.value)}
      />
      <button className="request-card__send" type="submit" disabled={disabled}>
        {state === 'sending' ? 'Sending…' : 'Send to the team'}
      </button>
      {/* Under the button, not next to the email field: the hesitation about
          handing over an address lands at the moment of submitting, not while
          typing it. */}
      <p className="request-card__privacy">
        We will not share your email with anyone. We might only use it to reach
        out to you.
      </p>
      {state === 'error' && (
        <p className="request-card__error">
          That didn&rsquo;t go through. Try again?
        </p>
      )}
    </form>
  )
}
