import { QueryClient } from '@tanstack/vue-query'
import { persistQueryClient } from '@tanstack/query-persist-client-core'
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister'

const APP_VERSION = '1'

/** Cache key generation: changing instance (or app schema) invalidates the cache. */
export function makeBuster(url: string | null): string {
  return `lumen:${APP_VERSION}:${url ?? 'unconfigured'}`
}

/** Create a QueryClient with a localStorage-backed persister (disk-backed in the native webview). */
export function createPersistedQueryClient(url: string | null): QueryClient {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { staleTime: 30_000, gcTime: 1000 * 60 * 60 * 24 } },
  })
  const persister = createSyncStoragePersister({ storage: window.localStorage })
  persistQueryClient({
    queryClient,
    persister,
    buster: makeBuster(url),
    maxAge: 1000 * 60 * 60 * 24, // 24h
  })
  return queryClient
}
