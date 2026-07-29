#!/bin/sh
# Write the runtime config the SPA reads, then hand off to nginx.
#
# The bundle is already compiled by the time this runs, so it cannot read the
# container's environment directly. Instead we emit /env.js, which index.html
# loads before the bundle, and src/runtime-env.js reads from window.__ENV__.
#
# This is what makes the image configurable from Coolify: same image in every
# environment, pointed at a different backend by changing a variable here.
set -eu

OUT=/usr/share/nginx/html/env.js

# Fail loud and actionable rather than serving an app that silently calls the
# wrong origin. An empty VITE_API_BASE means every request would go to a
# relative /v2/* path, hit nginx's SPA fallback and return index.html where the
# client expects JSON — which looks like a frontend bug and is not one.
if [ -z "${VITE_API_BASE:-}" ]; then
  echo "FATAL: VITE_API_BASE is not set." >&2
  echo "  Set it on this service (e.g. https://devflapi.utkrusht.ai) and restart." >&2
  echo "  Without it every API call resolves to this container instead of the backend." >&2
  exit 1
fi

# json_escape: quote the characters that would break the emitted JS. Values come
# from our own deployment config, but a stray quote would corrupt every config
# value rather than just one, so it is worth the two lines.
json_escape() {
  printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g'
}

{
  printf 'window.__ENV__ = {'
  printf '"VITE_API_BASE":"%s",'          "$(json_escape "${VITE_API_BASE}")"
  printf '"VITE_SUPABASE_URL":"%s",'      "$(json_escape "${VITE_SUPABASE_URL:-}")"
  printf '"VITE_SUPABASE_ANON_KEY":"%s",' "$(json_escape "${VITE_SUPABASE_ANON_KEY:-}")"
  printf '"VITE_POSTHOG_KEY":"%s",'       "$(json_escape "${VITE_POSTHOG_KEY:-}")"
  printf '"VITE_POSTHOG_HOST":"%s"'       "$(json_escape "${VITE_POSTHOG_HOST:-}")"
  printf '};\n'
} > "$OUT"

echo "runtime config written to $OUT (VITE_API_BASE=${VITE_API_BASE})"

exec "$@"
