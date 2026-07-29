# Build the Vite bundle, then serve the static files with nginx.
#
# VITE_* vars are compile-time (baked into the bundle), so the backend URL is
# passed as a build ARG. In Coolify set the build arg VITE_API_BASE to the
# deployed backend, e.g. https://taskbuilder-dev.utkrusht.ai — the app then
# calls it cross-origin (the backend sends CORS headers).

FROM node:22-alpine AS build
WORKDIR /app
# .npmrc routes the @ngm9 scope to GitHub Packages. The token is mounted as a
# BuildKit secret (never baked into a layer) so it stays out of the image
# history. Same pattern as recruiter-utkrusht's Dockerfile.
COPY package.json package-lock.json* .npmrc* ./
RUN --mount=type=secret,id=node_auth_token \
    NODE_AUTH_TOKEN="$(cat /run/secrets/node_auth_token 2>/dev/null || true)"; export NODE_AUTH_TOKEN; \
    npm ci || npm install
# Pin @ngm9/recruiter-client to the channel version CI resolved (dev image ->
# @dev, prod image -> @latest). Its own layer so it only busts when the version
# changes and the install above stays cached. --no-save leaves package.json and
# the lockfile untouched, so main and release never diverge on the pin, and a
# local build that passes nothing just uses the committed baseline.
#
# This is what keeps the frontend from lagging the backend: the moment Flask
# merges a route and the client republishes, the next image picks it up. No
# manual pin bump, no window where the UI calls an operation that does not exist.
ARG CLIENT_VERSION=""
RUN --mount=type=secret,id=node_auth_token \
    NODE_AUTH_TOKEN="$(cat /run/secrets/node_auth_token 2>/dev/null || true)"; export NODE_AUTH_TOKEN; \
    if [ -n "$CLIENT_VERSION" ]; then npm install --no-save "@ngm9/recruiter-client@${CLIENT_VERSION}"; fi

COPY . .

# No VITE_* build args. Configuration is injected at RUNTIME by
# docker-entrypoint.sh, which writes /env.js from the container's environment;
# src/runtime-env.js reads it. That makes one image runnable in every
# environment and configurable from Coolify without a rebuild.
#
# CLIENT_VERSION above stays a build arg because it selects an npm dependency —
# that genuinely cannot be deferred to runtime.
RUN npm run build

FROM nginx:1.27-alpine AS runtime
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
# Writes /env.js from this container's environment, then execs nginx. Refuses to
# start if VITE_API_BASE is unset — better a container that will not boot than
# one that serves an app pointing at the wrong origin.
# Named /entrypoint.sh, not /docker-entrypoint.sh — the nginx image already ships
# one at that path and overwriting it would drop its own init.
COPY docker-entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
ENTRYPOINT ["/entrypoint.sh"]
CMD ["nginx", "-g", "daemon off;"]
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1/ >/dev/null 2>&1 || exit 1
