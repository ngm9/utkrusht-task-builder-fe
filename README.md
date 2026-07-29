# Task Builder — Frontend

The web UI for the Utkrusht **Task Builder**: a chat that interviews you for a
coding-assessment brief, then runs the generation pipeline with live progress.
Built with **React + Vite**, served by nginx in production.

The backend is the **Flask service** in `ngm9/Utkrushta` (`/v2/task-builder/*`),
reached through the generated `@ngm9/recruiter-client`. Run progress is
**polled**, not streamed — there is deliberately no SSE endpoint, because a
stream would pin a sync gunicorn worker for the whole multi-minute run.

## Develop

```bash
npm install
cp .env.example .env      # then edit — see Environment below
npm run dev               # http://localhost:5173
```

By default `VITE_API_BASE` is empty, so the app calls relative `/v2/*` and the
Vite dev server proxies them to `VITE_DEV_PROXY_TARGET` — same-origin in the
browser, so **no CORS is needed in dev**.

## Environment

| Var | Purpose |
|-----|---------|
| `VITE_API_BASE` | Flask origin. **Leave empty for dev** (uses the proxy). Set in a deployment — see "Configuration is RUNTIME" below. |
| `VITE_DEV_PROXY_TARGET` | Dev-only: where `vite dev` proxies `/v2` to when `VITE_API_BASE` is empty. |
| `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` | Read directly by the skills panel and task-detail card. |
| `VITE_POSTHOG_KEY` / `VITE_POSTHOG_HOST` | Optional analytics; omit to disable. |
| `VITE_DEV_JWT` | **Local only.** Every task-builder route is public, so this is unnecessary in any deployment and the container entrypoint refuses to emit it. |

In `vite dev` these come from `.env`. In a container they come from the service
environment at startup, not from the build.

## Build / deploy

```bash
npm run build             # → dist/  (static files)
```

Containerized (multi-stage Node build → nginx):

```bash
docker build -t task-builder-web .
docker run -p 8080:80 -e VITE_API_BASE=https://devflapi.utkrusht.ai task-builder-web
```

Note the backend URL is a `-e` **runtime** flag, not a `--build-arg`.

### Configuration is RUNTIME, not build-time

`docker-entrypoint.sh` writes `/env.js` from the container's own environment on
every start; `index.html` loads it before the bundle and `src/runtime-env.js`
reads it. So the deployed app is configured by **Coolify environment variables**:

| Variable | Required | Notes |
|---|---|---|
| `VITE_API_BASE` | **yes** | Flask origin. The container refuses to start without it. |
| `VITE_SUPABASE_URL` | for the skills panel | |
| `VITE_SUPABASE_ANON_KEY` | for the skills panel | |
| `VITE_POSTHOG_KEY` / `_HOST` | no | omit to disable analytics |

Change one, restart the service — **no rebuild**. The same image runs in every
environment, which is why the workflows pass no `VITE_*` build args.

Two consequences:

- `/env.js` is served `no-store`. Caching it would keep returning visitors on
  the old backend after a config change.
- These values are **public** — anyone can fetch `/env.js`, exactly as they
  could previously read them out of the bundle. Runtime injection buys
  operability, not secrecy. Never put a real secret here. `VITE_DEV_JWT` is
  deliberately not emitted by the entrypoint at all.

`CLIENT_VERSION` remains a build arg: it selects an npm dependency, which
genuinely cannot be deferred to runtime.

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
  App.jsx           orchestrator: session, chat, brief, generation polling, persistence
  client.js         configures @ngm9/recruiter-client + re-exports its ops
  runtime-env.js    reads /env.js (runtime) with an import.meta.env fallback
  auth.js           optional dev JWT holder
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
