// A media src needs RPC resolution only when it's a root-relative GitLab path
// (a bare /uploads/... or the rewritten /v4/... proxy path); those 404 under the
// views:// origin and must be fetched with the auth token and swapped for a blob
// URL. Scheme-qualified URLs (http(s):, data:, blob:) load directly in the webview,
// so routing them through the asset RPC — which prepends `${gitlabUrl}/api` — would
// build a garbage URL and either waste a round-trip or clobber a working image.
export function needsAssetResolution(path: string): boolean {
  return path.startsWith('/')
}

// After markdown render, every deferred media element carries data-media-src holding
// its GitLab upload path (see needsAssetResolution). We fetch each through RPC and
// swap in a blob URL (src for media, href for files).
export async function applyResolvedMedia(
  root: HTMLElement,
  resolve: (path: string) => Promise<string>,
): Promise<void> {
  const els = Array.from(root.querySelectorAll<HTMLElement>('[data-media-src]'))
  await Promise.all(
    els.map(async (el) => {
      const path = el.getAttribute('data-media-src')
      if (!path || !needsAssetResolution(path)) return
      const url = await resolve(path)
      if (el.tagName === 'A') {
        el.setAttribute('href', url)
      } else {
        el.setAttribute('src', url)
        // Clear the placeholder state now that the real media can paint.
        el.removeAttribute('data-media-loading')
      }
    }),
  )
}
