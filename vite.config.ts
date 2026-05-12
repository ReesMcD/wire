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
        // Daily 05:00 UTC — Vercel cron hits `/_vercel/cron` (see README / Vercel Cron Jobs after deploy).
        '0 5 * * *': ['sync'],
      },
      vercel: {
        functions: {
          maxDuration: 300,
        },
        functionRules: {
          // Cron handler runs full sync in-process; must allow long timeout (Playwright sources).
          '/_vercel/cron': {
            maxDuration: 300,
          },
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
