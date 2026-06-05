// Dev-server port shared with vite.config.ts. Both sides read LUMEN_DEV_PORT
// (default 5273 — a dedicated port, NOT Vite's common 5173, so it doesn't collide
// with other projects' dev servers) so the window always loads the port Vite
// actually bound. vite.config sets `strictPort` so Vite can't silently drift.
export const DEV_PORT = process.env.LUMEN_DEV_PORT ?? '5273'
export const DEV_URL = `http://localhost:${DEV_PORT}`

async function defaultProbe(): Promise<boolean> {
  try {
    return (await fetch(DEV_URL, { method: 'HEAD' })).ok
  } catch {
    return false
  }
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

export interface ResolveStartUrlOptions {
  /** True only when launched for HMR (app:hmr sets LUMEN_HMR=1). */
  hmr: boolean
  probe?: () => Promise<boolean>
  attempts?: number
  delayMs?: number
  sleep?: (ms: number) => Promise<void>
}

/**
 * Decide the BrowserWindow URL. In HMR mode, poll for the Vite dev server —
 * absorbing the `vite & electrobun dev` startup race — before falling back to
 * the bundled app. Outside HMR (e.g. app:dev), load the bundle directly with no
 * probe, so a prod-copy launch never stalls waiting for a server that isn't there.
 */
export async function resolveStartUrl(opts: ResolveStartUrlOptions): Promise<string> {
  const { hmr, probe = defaultProbe, attempts = 40, delayMs = 150, sleep = defaultSleep } = opts
  if (hmr) {
    for (let i = 0; i < attempts; i++) {
      if (await probe()) return `${DEV_URL}/index.html`
      await sleep(delayMs)
    }
  }
  return 'views://mainview/index.html'
}
