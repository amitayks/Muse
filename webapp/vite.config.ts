import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
  server: {
    proxy: {
      '/api/v1': {
        target: 'http://localhost:8787',
        changeOrigin: true,
      },
      '/media': {
        target: 'http://localhost:8787',
        changeOrigin: true,
      },
    },
  },
})
