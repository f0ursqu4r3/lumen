import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const queryClear = vi.fn()
vi.mock('@tanstack/vue-query', () => ({ useQueryClient: () => ({ clear: queryClear }) }))
const clearPersistedCache = vi.fn()
vi.mock('@/shared/lib/persist', () => ({ clearPersistedCache: () => clearPersistedCache() }))
const pushToast = vi.fn()
vi.mock('@/shared/composables/useToast', () => ({ pushToast: (a: unknown) => pushToast(a) }))
const notifyCacheCleared = vi.fn()
vi.mock('@/shared/lib/rpc', () => ({ rpc: { notifyCacheCleared: () => notifyCacheCleared() } }))

import DataCachePane from './DataCachePane.vue'

beforeEach(() => vi.clearAllMocks())

describe('DataCachePane', () => {
  it('clears the query + persisted cache', async () => {
    const w = mount(DataCachePane)
    await w.find('[data-testid="settings-clear-cache"]').trigger('click')
    await flushPromises()
    expect(queryClear).toHaveBeenCalled()
    expect(clearPersistedCache).toHaveBeenCalled()
    expect(notifyCacheCleared).toHaveBeenCalled()
  })
})
