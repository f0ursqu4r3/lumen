import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const getConfig = vi.fn()
const clearConfig = vi.fn()
const notifyCacheCleared = vi.fn()
vi.mock('@/shared/lib/rpc', () => ({
  rpc: {
    getConfig: () => getConfig(),
    clearConfig: () => clearConfig(),
    notifyCacheCleared: () => notifyCacheCleared(),
  },
}))

const save = vi.fn().mockResolvedValue(true)
vi.mock('@/shared/composables/useGitlabConnect', () => ({
  useGitlabConnect: () => ({
    url: { value: 'https://gl.example.com' },
    token: { value: '' },
    tokenSuffix: { value: 'abc123' },
    tokenPlaceholder: { value: 'Current token ends …abc123' },
    status: { value: 'idle' },
    message: { value: '' },
    testing: { value: false },
    canSubmit: { value: true },
    save,
  }),
}))

const queryClear = vi.fn()
vi.mock('@tanstack/vue-query', () => ({ useQueryClient: () => ({ clear: queryClear }) }))
vi.mock('@/shared/lib/persist', () => ({ clearPersistedCache: vi.fn() }))
const pushToast = vi.fn()
vi.mock('@/shared/composables/useToast', () => ({ pushToast: (a: unknown) => pushToast(a) }))
vi.mock('@/shared/composables/useConfirm', () => ({
  useConfirm: () => ({ confirm: () => Promise.resolve(true) }),
}))
const replace = vi.fn()
vi.mock('vue-router', () => ({ useRouter: () => ({ replace }) }))

import ConnectionPane from './ConnectionPane.vue'

beforeEach(() => {
  vi.clearAllMocks()
  getConfig.mockResolvedValue({
    url: 'https://gl.example.com',
    configured: true,
    tokenSuffix: 'abc123',
  })
})

describe('ConnectionPane', () => {
  it('shows the instance URL and saves the connection', async () => {
    const w = mount(ConnectionPane)
    await flushPromises()
    expect(w.find('#settings-url').exists()).toBe(true)
    await w.find('[data-testid="settings-save-connection"]').trigger('click')
    expect(save).toHaveBeenCalled()
  })

  it('disconnects via the host (clearConfig), which resets the main window', async () => {
    const w = mount(ConnectionPane)
    await flushPromises()
    await w.find('[data-testid="settings-disconnect"]').trigger('click')
    await flushPromises()
    expect(clearConfig).toHaveBeenCalled()
  })
})
