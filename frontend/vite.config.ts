import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@shared': path.resolve(__dirname, './src/shared'),
      '@features': path.resolve(__dirname, './src/features'),
      '@components': path.resolve(__dirname, './src/shared/components'),
      '@lib': path.resolve(__dirname, './src/shared/lib'),
      '@hooks': path.resolve(__dirname, './src/shared/hooks'),
      '@context': path.resolve(__dirname, './src/shared/context'),
      '@/context': path.resolve(__dirname, './src/shared/context'),
      // Force Vite/Rollup to use the browser-safe mqtt build (no Node.js built-ins)
      'mqtt': 'mqtt/dist/mqtt.esm.js',
    },
  },
  plugins: [
    tailwindcss(),
    react(),
  ],
  build: {
    rollupOptions: {
      // Removed: externalizing Node.js built-ins was wrong — mqtt/dist/mqtt.esm.js
      // is self-contained and does not need them. Externalizing caused runtime errors.
    },
  },
  server: {
    host: true,
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      }
    }
  }
})
