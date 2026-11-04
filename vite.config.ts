import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // AI-kall går via API-serveren (npm run dev:api), som har Gemini-nøkkelen.
    proxy: { '/api': `http://localhost:${process.env.AI_SERVER_PORT ?? 8787}` },
  },
})
