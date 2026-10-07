import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        // Parallel stacks: point VITE_API_TARGET at the worktree's backend port.
        target: process.env.VITE_API_TARGET || 'http://127.0.0.1:5001',
        changeOrigin: true,
      },
    },
  },
})
