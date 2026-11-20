import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { execSync } from 'node:child_process'

// X-CEDA-Client: <app>@<git sha> (S1, ceda-security). The API groups refusals by it, so a refusal points at the build.
// Docker builds have no .git, so they pass CEDA_GIT_SHA.
function gitSha() {
  if (process.env.CEDA_GIT_SHA) return process.env.CEDA_GIT_SHA.slice(0, 12)
  try { return execSync('git rev-parse --short=12 HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() } catch { return 'unknown' }
}

export default defineConfig({
  plugins: [react()],
  define: {
    'import.meta.env.VITE_CEDA_CLIENT': JSON.stringify(`public@${gitSha()}`),
  },
  // Dev only: same-origin API calls (no CORS), like the staff console. VITE_API_URL still wins when set.
  server: {
    proxy: {
      '/api':   { target: process.env.VITE_API_PROXY_TARGET ?? 'http://localhost:8001', changeOrigin: true },
      '/media': { target: process.env.VITE_API_PROXY_TARGET ?? 'http://localhost:8001', changeOrigin: true },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-ui':    ['lucide-react', 'clsx'],
          'vendor-axios': ['axios'],
        },
      },
    },
    chunkSizeWarningLimit: 600,
  },
})
