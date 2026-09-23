/// <reference types="vite/client" />

declare module '*.sql?raw' {
  const content: string
  export default content
}

interface ImportMetaEnv {
  readonly VITE_DATA_SOURCE?: 'demo' | 'supabase'
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_ANON_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
