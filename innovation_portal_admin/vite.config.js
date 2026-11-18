import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/staff/',
  server: {
    proxy: {
      '/api':    { target: process.env.VITE_API_PROXY_TARGET ?? 'http://localhost:8001', changeOrigin: true },
      '/media':  { target: process.env.VITE_API_PROXY_TARGET ?? 'http://localhost:8001', changeOrigin: true },
      '/static': { target: process.env.VITE_API_PROXY_TARGET ?? 'http://localhost:8001', changeOrigin: true },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-query': ['@tanstack/react-query'],
          'vendor-ui':    ['lucide-react', 'clsx'],
        },
      },
    },
    chunkSizeWarningLimit: 600,
  },
})
