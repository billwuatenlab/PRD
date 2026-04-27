import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 56001,
    strictPort: true,
    host: true,
    proxy: {
      '/api': {
        target: 'http://localhost:58001',
        changeOrigin: true,
      },
    },
  },
})
