import { ref, watchEffect, type Ref } from 'vue'
import { rpc } from '@/lib/rpc'

const cache = new Map<string, Promise<string>>()

function base64ToBlob(base64: string, contentType: string): Blob {
  const bin = atob(base64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new Blob([bytes], { type: contentType })
}

/** Resolve a GitLab upload path to a memoized object-URL via the Bun RPC. */
export function resolveAsset(path: string): Promise<string> {
  const hit = cache.get(path)
  if (hit) return hit
  const p = rpc
    .gitlabAsset({ path })
    .then(({ base64, contentType }) => URL.createObjectURL(base64ToBlob(base64, contentType)))
  cache.set(path, p)
  return p
}

/** Test-only: drop the module cache. */
export function __clearAssetCache(): void {
  cache.clear()
}

/** Reactive helper: returns a ref that fills with the blob URL once resolved. */
export function useGitlabAsset(path: Ref<string> | (() => string)) {
  const url = ref<string | null>(null)
  watchEffect(() => {
    const p = typeof path === 'function' ? path() : path.value
    if (p)
      resolveAsset(p)
        .then((u) => {
          url.value = u
        })
        .catch(() => {
          url.value = null
        })
  })
  return url
}
