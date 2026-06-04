import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import tailwindcss from '@tailwindcss/vite';
import vueDevTools from 'vite-plugin-vue-devtools';
import { fileURLToPath } from 'node:url';

// Vite builds the SPA; the Electrobun Bun process is the runtime that talks to
// GitLab (see src/bun/). base:'./' keeps asset URLs relative for the views:// origin.
export default defineConfig({
  base: './',
  plugins: [vue(), tailwindcss(), vueDevTools()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
});
