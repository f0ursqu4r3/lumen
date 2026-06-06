import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'

const getConfig = vi.fn()
const saveConfig = vi.fn()
const clearConfig = vi.fn()
const gitlabGraphql = vi.fn()
vi.mock('@/shared/lib/rpc', () => ({
  rpc: {
    getConfig: () => getConfig(),
    saveConfig: (a: unknown) => saveConfig(a),
    clearConfig: () => clearConfig(),
    gitlabGraphql: (a: unknown) => gitlabGraphql(a),
  },
}))

const replace = vi.fn()
vi.mock('vue-router', () => ({ useRouter: () => ({ replace }) }))

const clearPersistedCache = vi.fn()
vi.mock('@/shared/lib/persist', () => ({ clearPersistedCache: () => clearPersistedCache() }))

const queryClientClear = vi.fn()
vi.mock('@tanstack/vue-query', () => ({ useQueryClient: () => ({ clear: queryClientClear }) }))

const pushToast = vi.fn()
vi.mock('@/shared/composables/useToast', () => ({ pushToast: (a: unknown) => pushToast(a) }))

// confirm() resolves true so the disconnect path proceeds in tests.
vi.mock('@/shared/composables/useConfirm', () => ({
  useConfirm: () => ({ confirm: () => Promise.resolve(true) }),
}))

import SettingsDialog from './SettingsDialog.vue'
import { settingsState, closeSettings } from '@/shared/composables/useSettings'

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('__APP_VERSION__', '9.9.9')
  getConfig.mockResolvedValue({ url: 'https://gitlab.example.com', configured: true })
  gitlabGraphql.mockResolvedValue({ status: 200, data: { currentUser: { username: 'kyle' } }, errors: [] })
  closeSettings()
})

describe('SettingsDialog', () => {
  it('shows the instance URL, version and username when open', async () => {
    const w = mount(SettingsDialog, { attachTo: document.body })
    settingsState.open = true
    await flushPromises()
    await nextTick()
    expect(document.body.textContent).toContain('gitlab.example.com')
    expect(document.body.textContent).toContain('9.9.9')
    expect(document.body.textContent).toContain('kyle')
    w.unmount()
  })

  it('clears cache and toasts on Clear cached data', async () => {
    const w = mount(SettingsDialog, { attachTo: document.body })
    settingsState.open = true
    await flushPromises()
    document.querySelector<HTMLElement>('[data-testid="settings-clear-cache"]')!.click()
    await flushPromises()
    expect(queryClientClear).toHaveBeenCalled()
    expect(clearPersistedCache).toHaveBeenCalled()
    expect(pushToast).toHaveBeenCalledWith(expect.objectContaining({ tone: 'success' }))
    w.unmount()
  })

  it('swaps token: saves, toasts success, and clears the input', async () => {
    saveConfig.mockResolvedValue({ ok: true })
    const w = mount(SettingsDialog, { attachTo: document.body })
    settingsState.open = true
    await flushPromises()
    const input = document.querySelector<HTMLInputElement>('#settings-token')!
    input.value = 'glpat-new'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await flushPromises()
    document.querySelector<HTMLElement>('[data-testid="settings-swap-token"]')!.click()
    await flushPromises()
    expect(saveConfig).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'https://gitlab.example.com', token: 'glpat-new' }),
    )
    expect(pushToast).toHaveBeenCalledWith(expect.objectContaining({ tone: 'success' }))
    expect(input.value).toBe('')
    w.unmount()
  })

  it('disconnects: clears config + cache and routes to connect', async () => {
    const w = mount(SettingsDialog, { attachTo: document.body })
    settingsState.open = true
    await flushPromises()
    clearConfig.mockResolvedValue({ ok: true })
    document.querySelector<HTMLElement>('[data-testid="settings-disconnect"]')!.click()
    await flushPromises()
    expect(clearConfig).toHaveBeenCalled()
    expect(clearPersistedCache).toHaveBeenCalled()
    expect(replace).toHaveBeenCalledWith({ name: 'connect' })
    w.unmount()
  })
})
