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
    },
  },
  plugins: [
    tailwindcss(),
    react(),
  ],
  build: {
    rollupOptions: {
      external: [
        'net', 'tls', 'fs', 'path', 'os', 'crypto', 'stream',
        'http', 'https', 'zlib', 'events', 'util', 'url',
        'buffer', 'querystring', 'string_decoder', 'punycode',
        'dns', 'dgram', 'child_process', 'cluster', 'module',
        'readline', 'repl', 'vm', 'worker_threads',
      ],
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
