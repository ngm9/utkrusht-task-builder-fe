import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// The client is configured with baseUrl:'' so it calls relative /v2/* — this
// dev-server proxy forwards them to the local Flask backend, same-origin in the
// browser, so no CORS needed while developing.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const proxyTarget = env.VITE_DEV_PROXY_TARGET || 'http://127.0.0.1:4000'
  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        '/v2': { target: proxyTarget, changeOrigin: true },
      },
    },
  }
})
