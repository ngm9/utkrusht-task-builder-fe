# Task Builder — Frontend

The web UI for the Utkrusht **Task Builder**: a chat that interviews you for a
coding-assessment brief, then runs the generation pipeline with live progress.
Built with **React + Vite**. The backend is a **separate service** (FastAPI) —
this app talks to it over `/api/*` + Server-Sent Events.

## Develop

```bash
npm install
cp .env.example .env      # then edit — see Environment below
npm run dev               # http://localhost:5173
```

By default `VITE_API_BASE` is empty, so the app calls relative `/api/*` and the
Vite dev server proxies them to `VITE_DEV_PROXY_TARGET` — same-origin in the
browser, so **no CORS is needed in dev**.

## Environment

| Var | Purpose |
|-----|---------|
| `VITE_API_BASE` | Absolute backend URL. **Leave empty for dev** (uses the proxy). In a production build it is baked in at build time and the app calls it cross-origin — the backend must send CORS headers (it does, via its `CORS_ALLOW_ORIGINS`). |
| `VITE_DEV_PROXY_TARGET` | Dev-only: where `vite dev` proxies `/api` to when `VITE_API_BASE` is empty. |
| `VITE_INTERNAL_TOKEN` | Optional backend access token. When set, the UI auto-attaches it and never prompts. ⚠️ **See the security note below.** |

`VITE_*` values are **compile-time**. A production build bakes them into the
bundle, so set them as build args (see `Dockerfile`), not runtime envs.

## Access token

Deployed backends set `INTERNAL_PROXY_TOKEN`; every `/api/*` call must carry it
as `X-Internal-Token` (the SSE stream passes it as `?access_token=`, since
`EventSource` cannot set headers).

Two ways to supply it:

1. **Prompt (default, secure).** The UI prompts on the first `403`, stores the
   token in `localStorage`, and attaches it from then on. The token never
   appears in the shipped code.
2. **`VITE_INTERNAL_TOKEN` (convenient, not secret).** Set it and the app
   auto-attaches the token — no prompt. ⚠️ Vite **bakes it into the client
   bundle**, so anyone who loads the app can read it (View Source / DevTools);
   the token then no longer protects the API. Only use this when the frontend
   itself is access-controlled or the API is not sensitive. For a public app,
   prefer the prompt, or put a real auth layer in front (e.g. a server-side
   proxy that injects the token).

## Build / deploy

```bash
npm run build             # → dist/  (static files)
```

Containerized (multi-stage Node build → nginx):

```bash
docker build --build-arg VITE_API_BASE=https://your-backend-url -t task-builder-web .
docker run -p 8080:80 task-builder-web
```

Deploy the image as its own service (Coolify / Dokploy), publish port `80`, and
set the `VITE_API_BASE` **build arg** to the deployed backend URL.

### CI/CD

| Workflow | Trigger | Client channel | Image |
|---|---|---|---|
| `ci.yml` | push / PR to `main`, `release`, `staging` | resolves `@dev`, or `@latest` for `release` | — |
| `dev-image.yml` | CI success on `main` | `@dev` | `ghcr.io/ngm9/utkrusht-task-builder-fe-dev` |
| `prod-image.yml` | CI success on `release` | `@latest` | `ghcr.io/ngm9/utkrusht-task-builder-fe-prod` |

The committed `@ngm9/recruiter-client` pin is only a resolvable baseline for
local installs. Every build — CI and image alike — floats it to the channel
dist-tag with `npm install --no-save`, so the frontend cannot lag a freshly
published client and `main`/`release` never diverge on the pin.

> **Production is blocked until a stable client ships the task-builder API.**
> The `@latest` channel is currently `2.0.0`, which predates those routes and
> carries none of them; they exist only on `@dev`. `prod-image.yml` preflights
> this and fails with an explicit message rather than a rollup export error.

### Why this app calls Flask directly from the browser

The house pattern (see the recruiter-client guide) is **never call Flask from
the browser** — because the recruiter token is an httpOnly `authToken` cookie
that browser JS cannot read, so calls must go through server-side Next.js code.

Neither half of that applies here:

- This is a **Vite SPA served by nginx**. There is no server runtime to proxy
  through — no `next/headers`, no `src/app/api/**`.
- Every `/v2/task-builder/*` route is **PUBLIC** (see `PUBLIC_ROUTES` in the
  backend's `auth_middleware.py`). There is no token to keep out of the bundle;
  the unguessable conversation UUID is the credential.

So calls go browser → Flask cross-origin, which means this app's origin **must**
be listed in the backend's `FLASK_CORS_ORIGINS`. If this frontend ever needs a
*guarded* Flask route, that reasoning stops holding and it needs a server-side
seam — do not just add a token to the bundle.

## Layout

```
src/
  main.jsx          entry
  App.jsx           orchestrator: session, chat, brief, generation, SSE, persistence
  api.js            fetch wrapper + token handling + SSE URL helper
  config.js         API_BASE from VITE_API_BASE
  persist.js        transcript persistence (localStorage)
  lib.js            scenario parser + id helper
  constants.js      slot defs, pipeline stages, starters
  components/
    Header.jsx      brand header + New task / Download PDF
    Chat.jsx        message renderers (bubble / divider / stage-log / result)
    BriefPanel.jsx  live task brief, review step, pipeline checklist
    ScenarioModal.jsx  scenario preparation + selection
index.css           ported verbatim from the original UI (utkrusht.ai brand)
```
