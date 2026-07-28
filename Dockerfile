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
COPY . .
ARG VITE_API_BASE=""
# Optional: bake the backend token into the bundle so the app never prompts.
# WARNING: it becomes readable by anyone who loads the app — only use it for an
# access-controlled frontend / non-sensitive API (see README "Access token").
ARG VITE_INTERNAL_TOKEN=""
ENV VITE_API_BASE=$VITE_API_BASE \
    VITE_INTERNAL_TOKEN=$VITE_INTERNAL_TOKEN
RUN npm run build

FROM nginx:1.27-alpine AS runtime
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1/ >/dev/null 2>&1 || exit 1
