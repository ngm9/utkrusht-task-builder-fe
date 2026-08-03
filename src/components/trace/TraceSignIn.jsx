import { useEffect, useRef, useState } from 'react'
import { renderGoogleButton } from '../../googleSignIn.js'
import { signInWithGoogle } from '../../traceApi.js'
import { setJwt } from '../../auth.js'

// Google's button + the exchange for a trace session token.
//
// Failure states are deliberately distinct, because they need different
// actions from whoever hits them:
//   * GIS did not load       -> an ad blocker, or an unregistered origin
//   * Google rejected you    -> not signed in / wrong account
//   * we rejected you (403)  -> a real Google account, but not Utkrusht staff
// Collapsing those into "sign-in failed" would send someone hunting for the
// wrong problem — the third one in particular is not an error at all.
export default function TraceSignIn({ onSignedIn }) {
  const holder = useRef(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let live = true
    renderGoogleButton(holder.current, async (credential) => {
      if (!live) return
      setBusy(true); setError('')
      try {
        const { token } = await signInWithGoogle(credential)
        setJwt(token)
        onSignedIn()
      } catch (e) {
        // The server's own wording — it distinguishes "not a team account"
        // from "sign-in failed", and that difference matters to the reader.
        setError(String(e.message || e))
      } finally {
        if (live) setBusy(false)
      }
    }).catch((e) => live && setError(String(e.message || e)))
    return () => { live = false }
  }, [onSignedIn])

  return (
    <div className="tr-signin-box">
      <div ref={holder} />
      {busy && <div className="tr-signin-status">Checking your account…</div>}
      {error && <div className="tr-signin-error">{error}</div>}
    </div>
  )
}
