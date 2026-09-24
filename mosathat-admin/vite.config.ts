import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // A PGlite WASM-ot nem szabad a dep-optimizernek átgyúrnia.
  optimizeDeps: { exclude: ['@electric-sql/pglite'] },
  server: {
    port: 5173,
    host: true,
    // A migrációk a repó gyökerében vannak (../supabase), tehát a Vite
    // projektmappáján KÍVÜL. Enélkül a dev szerver nem szolgálná ki őket.
    fs: { allow: ['..'] },
  },
})
