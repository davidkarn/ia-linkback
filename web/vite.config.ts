import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // /api/books -> the Nest API's /books (npm start in ../, port 3000 by default)
    proxy: {
      '/api': {
        target: process.env.API_URL ?? 'http://localhost:3000',
        rewrite: path => path.replace(/^\/api/, ''),
      },
    },
  },
})
