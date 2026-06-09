import { QueryClient } from '@tanstack/vue-query'
import { persistQueryClient } from '@tanstack/query-persist-client-core'
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister'

const APP_VERSION = '1'

/** localStorage key for the TanStack Query persister; shared by write + clear. */
export const PERSIST_KEY = 'lumen:query-cache'

/** Drop the persisted query cache from localStorage (used by Settings → Clear cache). */
export function clearPersistedCache(): void {
  window.localStorage.removeItem(PERSIST_KEY)
}

/** Cache key generation: changing instance (or app schema) invalidates the cache. */
export function makeBuster(url: string | null): string {
  return `lumen:${APP_VERSION}:${url ?? 'unconfigured'}`
}

/** Create a QueryClient with a localStorage-backed persister (disk-backed in the native webview). */
export function createPersistedQueryClient(url: string | null): QueryClient {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { staleTime: 30_000, gcTime: 1000 * 60 * 60 * 24 } },
  })
  const persister = createSyncStoragePersister({ storage: window.localStorage, key: PERSIST_KEY })
  persistQueryClient({
    queryClient,
    persister,
    buster: makeBuster(url),
    maxAge: 1000 * 60 * 60 * 24, // 24h
    dehydrateOptions: {
      // Persist successful queries (the default), except ephemeral palette
      // typeahead results — otherwise a prior session's search would rehydrate
      // and flash stale hits into the command palette on the next launch.
      shouldDehydrateQuery: (query) =>
        query.state.status === 'success' &&
        query.queryKey[0] !== 'palette-issue-search' &&
        query.queryKey[0] !== 'palette-mr-search',
    },
  })
  return queryClient
}
