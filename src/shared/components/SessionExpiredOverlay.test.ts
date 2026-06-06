import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

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

import SessionExpiredOverlay from './SessionExpiredOverlay.vue'
import { sessionState } from '@/shared/composables/useSession'

const reload = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  sessionState.expired = false
  Object.defineProperty(window, 'location', { configurable: true, value: { reload } })
  getConfig.mockResolvedValue({ url: 'https://gitlab.example.com', configured: true })
})

describe('SessionExpiredOverlay', () => {
  it('renders nothing while the session is valid', () => {
    const w = mount(SessionExpiredOverlay, { attachTo: document.body })
    expect(document.querySelector('[data-testid="session-reconnect"]')).toBeNull()
    w.unmount()
  })

  it('blocks the screen and prefills the instance URL when expired', async () => {
    const w = mount(SessionExpiredOverlay, { attachTo: document.body })
    sessionState.expired = true
    await flushPromises()
    expect(document.querySelector('[data-testid="session-reconnect"]')).not.toBeNull()
    expect(document.body.textContent).toContain('gitlab.example.com')
    w.unmount()
  })

  it('reloads the app after a successful reconnect', async () => {
    saveConfig.mockResolvedValue({ ok: true })
    gitlabGraphql.mockResolvedValue({
      status: 200,
      data: { currentUser: { username: 'kyle' } },
      errors: [],
    })
    const w = mount(SessionExpiredOverlay, { attachTo: document.body })
    sessionState.expired = true
    await flushPromises()
    const input = document.querySelector<HTMLInputElement>('#session-token')!
    input.value = 'glpat-new'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await flushPromises()
    document.querySelector<HTMLElement>('[data-testid="session-reconnect"]')!.click()
    await flushPromises()
    expect(saveConfig).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'https://gitlab.example.com', token: 'glpat-new' }),
    )
    expect(reload).toHaveBeenCalled()
    w.unmount()
  })

  it('shows an error and does not reload on a failed reconnect', async () => {
    saveConfig.mockResolvedValue({ ok: true })
    gitlabGraphql.mockResolvedValue({ status: 401, errors: [{ message: 'Unauthorized' }] })
    const w = mount(SessionExpiredOverlay, { attachTo: document.body })
    sessionState.expired = true
    await flushPromises()
    const input = document.querySelector<HTMLInputElement>('#session-token')!
    input.value = 'glpat-bad'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await flushPromises()
    document.querySelector<HTMLElement>('[data-testid="session-reconnect"]')!.click()
    await flushPromises()
    expect(reload).not.toHaveBeenCalled()
    expect(document.body.textContent).toContain('Unauthorized')
    w.unmount()
  })

  it('clears config and reloads on Disconnect', async () => {
    clearConfig.mockResolvedValue({ ok: true })
    const w = mount(SessionExpiredOverlay, { attachTo: document.body })
    sessionState.expired = true
    await flushPromises()
    document.querySelector<HTMLElement>('[data-testid="session-disconnect"]')!.click()
    await flushPromises()
    expect(clearConfig).toHaveBeenCalled()
    expect(reload).toHaveBeenCalled()
    w.unmount()
  })
})
