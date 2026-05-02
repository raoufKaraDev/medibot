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
  optimizeDeps: {
    // Tell Vite's pre-bundler to use the browser ESM entry of mqtt v5
    include: ['mqtt'],
    esbuildOptions: {
      define: {
        // mqtt v5 checks for process.env.NODE_ENV internally
        'process.env.NODE_ENV': JSON.stringify('production'),
      },
      plugins: [
        {
          name: 'mqtt-browser',
          setup(build) {
            // Redirect any import of 'mqtt' to its browser ESM build
            build.onResolve({ filter: /^mqtt$/ }, () => ({
              path: require.resolve('mqtt/dist/mqtt.esm-browser.js'),
            }))
          },
        },
      ],
    },
  },
  build: {
    rollupOptions: {
      plugins: [
        {
          name: 'mqtt-browser-rollup',
          resolveId(id) {
            if (id === 'mqtt') {
              return { id: 'mqtt/dist/mqtt.esm-browser.js' }
            }
          },
        },
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
