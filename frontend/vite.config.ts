import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The SPA is built into the PHP app's docroot (public/app). During development
// the Vite server proxies API and MCP calls to the Local site so cookies stay
// same-origin.
export default defineConfig({
  plugins: [react()],
  base: '/',
  build: { outDir: '../public/app', emptyOutDir: true },
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://essen.local', changeOrigin: true },
      '/mcp': { target: 'http://essen.local', changeOrigin: true },
    },
  },
})
