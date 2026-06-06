/** Injected by Vite's `define` (see vite.config.ts) — the package.json version. */
declare const __APP_VERSION__: string

// electrobun pulls in `three` (a peer it uses internally) but ships no types for
// it, and we don't use three directly. Shim it to `any` so vue-tsc doesn't choke
// on electrobun's `import * as three from 'three'`.
declare module 'three'
