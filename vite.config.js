import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Dev local usa `vercel dev` para rodar as Vercel Functions com .env.local.
// O Vite serve apenas o frontend; as chamadas /api/* são interceptadas pelo Vercel CLI.
export default defineConfig({
  plugins: [react()],
  server: { port: 5175 }
})
