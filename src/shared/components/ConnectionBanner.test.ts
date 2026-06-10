import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'

const retryServerNow = vi.fn()
vi.mock('@/shared/lib/rpc', () => ({ rpc: { retryServerNow: () => retryServerNow() } }))

import ConnectionBanner from './ConnectionBanner.vue'
import { sessionState } from '@/shared/composables/useSession'

beforeEach(() => {
  retryServerNow.mockReset()
  sessionState.expired = false
  sessionState.unavailable = false
  sessionState.secondsLeft = 0
  sessionState.probing = false
})

describe('ConnectionBanner', () => {
  it('is hidden when the server is reachable', () => {
    const w = mount(ConnectionBanner)
    expect(w.find('[data-testid="connection-banner"]').exists()).toBe(false)
  })

  it('shows the countdown from sessionState when unavailable', async () => {
    const w = mount(ConnectionBanner)
    sessionState.unavailable = true
    sessionState.secondsLeft = 7
    await w.vm.$nextTick()
    expect(w.find('[data-testid="connection-banner"]').text()).toContain('7s')
  })

  it('Retry now pokes the host probe', async () => {
    const w = mount(ConnectionBanner)
    sessionState.unavailable = true
    await w.vm.$nextTick()
    await w.find('[data-testid="connection-retry-now"]').trigger('click')
    expect(retryServerNow).toHaveBeenCalled()
  })

  it('shows "retrying…" without a countdown or button while probing', async () => {
    const w = mount(ConnectionBanner)
    sessionState.unavailable = true
    sessionState.probing = true
    await w.vm.$nextTick()
    const banner = w.find('[data-testid="connection-banner"]')
    expect(banner.text()).toContain('retrying…')
    expect(w.find('[data-testid="connection-retry-now"]').exists()).toBe(false)
  })
})
