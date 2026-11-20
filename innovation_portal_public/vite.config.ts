import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
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
