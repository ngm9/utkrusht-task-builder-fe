// Placeholder runtime config.
//
// In a container, docker-entrypoint.sh OVERWRITES this file at startup with the
// real values from the service environment. This copy exists so that `vite dev`
// — and any build run outside a container — has something real to serve at
// /env.js.
//
// Without it, vite's SPA fallback answers /env.js with index.html, and the
// browser tries to execute HTML as JavaScript: a console error on every page
// load. The app still worked (runtime-env.js falls back to import.meta.env),
// but it looked broken.
//
// Empty on purpose: src/runtime-env.js treats an absent or empty value as "not
// set" and falls back to import.meta.env, which is what .env supplies in dev.
window.__ENV__ = {}
