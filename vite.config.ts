import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath } from 'node:url'

// The dev server IS the runtime: it proxies /gitlab/graphql to the GitLab
// instance and attaches the token server-side, so it never reaches the client.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'GITLAB_')
  const { GITLAB_URL, GITLAB_TOKEN } = env
  const headers: Record<string, string> = GITLAB_TOKEN
    ? { 'PRIVATE-TOKEN': GITLAB_TOKEN }
    : {}

  return {
    plugins: [vue(), tailwindcss()],
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    server: {
      proxy: {
        '/gitlab': {
          target: GITLAB_URL,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/gitlab/, '/api'),
          headers,
        },
      },
    },
  }
})
