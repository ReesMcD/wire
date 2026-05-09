import { defineConfig } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { nitro } from 'nitro/vite'

export default defineConfig({
  server: {
    port: 3000,
  },
  resolve: {
    alias: {
      '@': new URL('./app', import.meta.url).pathname,
    },
  },
  plugins: [
    tailwindcss(),
    tanstackStart({
      srcDirectory: 'app',
    }),
    nitro({
      serverDir: './',
      experimental: {
        tasks: true,
      },
      scheduledTasks: {
        '0 5 * * *': ['sync'],
      },
      vercel: {
        functions: {
          maxDuration: 300,
        },
        functionRules: {
          '/_nitro/tasks/sync': {
            maxDuration: 300,
          },
        },
      },
    }),
    react(),
  ],
  ssr: {
    external: ['playwright', 'playwright-core', 'chromium-bidi'],
    noExternal: [],
  },
})
