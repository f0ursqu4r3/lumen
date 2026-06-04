import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import tailwindcss from '@tailwindcss/vite';
import vueDevTools from 'vite-plugin-vue-devtools';
import { fileURLToPath } from 'node:url';

// Vite builds the SPA; the Electrobun Bun process is the runtime that talks to
// GitLab (see src/bun/). base:'./' keeps asset URLs relative for the views:// origin.
//
// Dedicated dev port shared with the Bun process (src/bun/startUrl.ts). strictPort
// makes Vite bind exactly this port or fail loudly, instead of silently drifting
// to 5174/5175/... while the desktop window still loads the wrong one.
const devPort = Number(process.env.LUMEN_DEV_PORT) || 5273;

export default defineConfig({
  base: './',
  plugins: [vue(), tailwindcss(), vueDevTools()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: { port: devPort, strictPort: true },
});
