// After markdown render, every media element carries data-media-src holding the
// GitLab upload path. Under the views:// origin those paths don't resolve, so we
// fetch each through RPC and swap in a blob URL (src for media, href for files).
export async function applyResolvedMedia(
  root: HTMLElement,
  resolve: (path: string) => Promise<string>,
): Promise<void> {
  const els = Array.from(root.querySelectorAll<HTMLElement>('[data-media-src]'))
  await Promise.all(
    els.map(async (el) => {
      const path = el.getAttribute('data-media-src')
      if (!path) return
      const url = await resolve(path)
      if (el.tagName === 'A') el.setAttribute('href', url)
      else el.setAttribute('src', url)
    }),
  )
}
