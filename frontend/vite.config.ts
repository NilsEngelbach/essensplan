import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The SPA is built into the PHP app's docroot (public/app) and its assets are
// requested from /app/…, so nginx/Apache serve them as plain files; every
// other path goes to public/index.php, which answers with app/index.html.
// During development the Vite server proxies API and MCP calls to the Local
// site so cookies stay same-origin.
export default defineConfig(({ command }) => ({
  plugins: [react()],
  base: command === 'build' ? '/app/' : '/',
  build: { outDir: '../public/app', emptyOutDir: true },
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://essen.local', changeOrigin: true },
      '/mcp': { target: 'http://essen.local', changeOrigin: true },
      // Recipe photos are served by the PHP app (storage/media, for the logged-in family only).
      '/media': { target: 'http://essen.local', changeOrigin: true },
    },
  },
}))
