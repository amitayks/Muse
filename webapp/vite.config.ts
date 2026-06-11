import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // ffmpeg.wasm (client-side video → X-spec normalization) is single-thread @ffmpeg/core,
  // so NO Cross-Origin-Isolation (COOP/COEP) headers are needed — important because those
  // headers can break the Telegram mini-app. The core is loaded at runtime from a CDN via
  // toBlobURL, so Vite does not bundle the ~31MB wasm. We only exclude these from dep
  // pre-bundling to avoid dev-server friction with ffmpeg's internal worker (see lib/transcode.ts).
  optimizeDeps: {
    exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util'],
  },
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
