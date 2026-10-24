import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  optimizeDeps: { exclude: ['@electric-sql/pglite'] },
  build: {
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      input: { main: 'index.html', publikus: 'publikus.html' },
      onwarn(figyelmeztetes, tovabb) {
        const hol = figyelmeztetes.id ?? figyelmeztetes.exporter ?? figyelmeztetes.loc?.file ?? ''
        if (hol.includes('@electric-sql/pglite')) return
        tovabb(figyelmeztetes)
      },
    },
  },
  server: {
    port: 5173,
    host: true,
    fs: { allow: ['..'] },
  },
})
