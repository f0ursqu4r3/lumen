import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath } from 'node:url'
import pkg from './package.json' with { type: 'json' }

export default defineConfig({
  plugins: [vue()],
  // Mirror vite.config's define so __APP_VERSION__ resolves in tests too (the
  // real Vite build injects it; vitest uses this config, not vite.config). Tests
  // that need a fixed value (e.g. SettingsDialog) still vi.stubGlobal over it.
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    environmentOptions: {
      jsdom: {
        url: 'http://localhost',
      },
    },
    setupFiles: ['src/test/setup.ts'],
  },
})
