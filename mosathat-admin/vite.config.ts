import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  optimizeDeps: { exclude: ['@electric-sql/pglite'] },
  build: {
    rollupOptions: {
      input: { main: 'index.html', publikus: 'publikus.html' },
    },
  },
  server: {
    port: 5173,
    host: true,
    fs: { allow: ['..'] },
  },
})
