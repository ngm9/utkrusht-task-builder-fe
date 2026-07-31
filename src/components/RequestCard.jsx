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
  const [note, setNote] = useState(
    request.subject ? `We need ${request.subject}. ` : '')
  const [state, setState] = useState('idle') // idle | sending | sent | error

  async function submit(e) {
    e.preventDefault()
    setState('sending')
    try {
      await createTaskBuilderRequest(conversationId, {
        ...request,
        email: email.trim(),
        message: note.trim(),
      })
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

  // Both fields required: a note without an address is unactionable, and an
  // address without a note tells the team nothing.
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
        className="request-card__email"
        type="email"
        value={email}
        placeholder="your@email.com"
        onChange={(ev) => setEmail(ev.target.value)}
      />
      <button className="request-card__send" type="submit" disabled={disabled}>
        {state === 'sending' ? 'Sending…' : 'Send to the team'}
      </button>
      {state === 'error' && (
        <p className="request-card__error">
          That didn&rsquo;t go through. Try again?
        </p>
      )}
    </form>
  )
}
