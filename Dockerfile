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

# Every VITE_* below is inlined into the JS bundle by `vite build`. They are
# BUILD ARGS on purpose — setting them as Coolify runtime env does nothing,
# because the bundle is already compiled by then.
ARG VITE_API_BASE=""
ARG VITE_SUPABASE_URL=""
ARG VITE_SUPABASE_ANON_KEY=""
ARG VITE_POSTHOG_KEY=""
ARG VITE_POSTHOG_HOST=""
ENV VITE_API_BASE=$VITE_API_BASE \
    VITE_SUPABASE_URL=$VITE_SUPABASE_URL \
    VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY \
    VITE_POSTHOG_KEY=$VITE_POSTHOG_KEY \
    VITE_POSTHOG_HOST=$VITE_POSTHOG_HOST

# Deliberately NOT passed: VITE_DEV_JWT. Vite would bake it into the bundle for
# anyone to read, and it buys nothing — every /v2/task-builder/* route is PUBLIC
# (see PUBLIC_ROUTES in the backend's auth_middleware.py). A deployed build must
# never carry a real testmaker token.
#
# VITE_INTERNAL_TOKEN was declared here but read by no code; dropped rather than
# left as config that looks load-bearing and is not.
RUN npm run build

FROM nginx:1.27-alpine AS runtime
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1/ >/dev/null 2>&1 || exit 1
