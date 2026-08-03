// Google Sign-In for the trace viewer, via Google Identity Services.
//
// Loaded as a <script> rather than an npm package: GIS is a Google-hosted
// library that must come from their origin anyway (it drops an iframe and
// talks to accounts.google.com), so vendoring it would buy nothing and add a
// dependency. Nothing else in this app needs it, and the trace page is the
// only caller.
//
// The button hands us a Google ID TOKEN — a JWT signed by Google. It is not a
// credential for our API: the backend verifies it against Google's public keys
// and, only if the verified address belongs to an Utkrusht team member, mints
// the ordinary testmaker JWT the rest of the app already uses.
import { env } from './runtime-env.js'
import { getSignInConfig } from './traceApi.js'

const GIS_SRC = 'https://accounts.google.com/gsi/client'

/** The OAuth client id, from the BACKEND.
 *
 *  Deliberately not a build-time VITE_* value: that would mean an environment
 *  variable to set in Vercel, a rebuild whenever it changes, and two places
 *  (frontend and backend) that can disagree about which OAuth client is in
 *  use. Fetching it means the page always uses the client belonging to the
 *  backend it is pointed at, and a static deploy needs no configuration at all.
 *
 *  A build-time value still wins if one is set, purely as an escape hatch for
 *  a backend that predates the config endpoint.
 */
export async function googleClientId() {
  const baked = env('VITE_GOOGLE_CLIENT_ID').trim()
  if (baked) return baked
  const { client_id: id } = await getSignInConfig()
  return (id || '').trim()
}

let loading = null

/** Load the GIS script once; resolves when window.google.accounts is usable. */
function loadGis() {
  if (window.google?.accounts?.id) return Promise.resolve()
  if (loading) return loading
  loading = new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = GIS_SRC
    s.async = true
    s.defer = true
    s.onload = () => resolve()
    // Reject rather than hang: an ad blocker or an offline machine should
    // surface as "sign-in unavailable", not a button that never appears.
    s.onerror = () => reject(new Error('Could not load Google Sign-In.'))
    document.head.appendChild(s)
  })
  return loading
}

/** Render Google's button into `el`, calling `onCredential(idToken)` on success.
 *
 *  Google owns the button's markup — its branding rules require it, and it is
 *  what makes the account chooser work. Returns a promise that rejects if GIS
 *  cannot load, so the caller can fall back to the paste flow.
 */
export async function renderGoogleButton(el, onCredential) {
  const clientId = await googleClientId()
  if (!clientId) {
    throw new Error('Google sign-in is not configured on the backend '
                    + '(GOOGLE_CLIENT_ID).')
  }
  await loadGis()
  window.google.accounts.id.initialize({
    client_id: clientId,
    callback: (response) => onCredential(response.credential),
    // No auto-select and no One Tap: this is an internal tool someone opens
    // deliberately, and a surprise sign-in prompt on a debugging page is
    // noise. They click the button when they mean to.
    auto_select: false,
    cancel_on_tap_outside: true,
  })
  window.google.accounts.id.renderButton(el, {
    theme: 'outline', size: 'large', text: 'signin_with', shape: 'pill',
  })
}
