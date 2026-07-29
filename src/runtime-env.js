// Runtime configuration, so a deployed image is configured by its ENVIRONMENT
// rather than by whatever was in scope when it was built.
//
// `vite build` inlines every `import.meta.env.VITE_*` into the bundle as a
// string literal — the shipped JS contains no `import.meta.env` at all. That
// makes a plain Vite app impossible to configure from Coolify: by the time the
// container starts, the values are already welded into the JavaScript and the
// container is only nginx serving static files.
//
// So the container writes `/env.js` at startup from its own environment
// (see docker-entrypoint.sh), index.html loads it before the bundle, and
// everything reads config through `env()` below.
//
// Consequences worth knowing:
//   * One image runs in every environment. Point it at a different backend by
//     changing a Coolify variable and restarting — no rebuild.
//   * `/env.js` must never be cached; nginx.conf sends `no-store` for it.
//   * These values are still PUBLIC. They land in a file any visitor can fetch,
//     exactly as they previously landed in the bundle. Runtime injection is
//     about operability, not secrecy — never put a real secret here.
//
// The `import.meta.env` fallback keeps `vite dev` working from `.env`, where no
// container and no /env.js exist.

const RUNTIME = (typeof window !== 'undefined' && window.__ENV__) || {}

/** Read one config value: runtime first, then build-time, then ''. */
export function env(key) {
  const runtime = RUNTIME[key]
  if (runtime !== undefined && runtime !== '') return runtime
  const build = import.meta.env[key]
  return build === undefined ? '' : build
}
