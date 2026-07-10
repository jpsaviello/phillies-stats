import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// The backend proxy (server/) owns all external API calls; in production the
// k8s ingress routes /api to it, in dev/preview Vite proxies to it locally.
const proxy = { '/api': 'http://localhost:8080' }

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { proxy },
  preview: { proxy },
})
