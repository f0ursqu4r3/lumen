import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'

const start = vi.fn()
const stop = vi.fn()
vi.mock('@/shared/composables/useServerRecovery', () => ({
  useServerRecovery: () => ({ start, stop }),
}))

import ConnectionBanner from './ConnectionBanner.vue'
import { sessionState } from '@/shared/composables/useSession'

const queryClient = new QueryClient()
const mountBanner = () =>
  mount(ConnectionBanner, { global: { plugins: [[VueQueryPlugin, { queryClient }]] } })

beforeEach(() => {
  start.mockReset()
  stop.mockReset()
  sessionState.expired = false
  sessionState.unavailable = false
})
describe('ConnectionBanner', () => {
  it('is hidden when the server is reachable', () => {
    const wrapper = mountBanner()
    expect(wrapper.find('[data-testid="connection-banner"]').exists()).toBe(false)
  })

  it('shows the banner and starts recovery when unavailable', async () => {
    const wrapper = mountBanner()
    sessionState.unavailable = true
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-testid="connection-banner"]').exists()).toBe(true)
    expect(start).toHaveBeenCalled()
  })

  it('stops recovery when the server becomes reachable again', async () => {
    const wrapper = mountBanner()
    sessionState.unavailable = true
    await wrapper.vm.$nextTick()
    sessionState.unavailable = false
    await wrapper.vm.$nextTick()
    expect(stop).toHaveBeenCalled()
  })

  it('stops recovery on unmount', async () => {
    const wrapper = mountBanner()
    sessionState.unavailable = true
    await wrapper.vm.$nextTick()
    stop.mockReset()
    wrapper.unmount()
    expect(stop).toHaveBeenCalled()
  })
})
