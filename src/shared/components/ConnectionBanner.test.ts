import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ref } from 'vue'
import { mount } from '@vue/test-utils'
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'

const start = vi.fn()
const stop = vi.fn()
const retryNow = vi.fn()
const secondsLeft = ref(0)
const probing = ref(false)
vi.mock('@/shared/composables/useServerRecovery', () => ({
  useServerRecovery: () => ({ start, stop, retryNow, secondsLeft, probing }),
}))

import ConnectionBanner from './ConnectionBanner.vue'
import { sessionState } from '@/shared/composables/useSession'

const queryClient = new QueryClient()
const mountBanner = () =>
  mount(ConnectionBanner, { global: { plugins: [[VueQueryPlugin, { queryClient }]] } })

beforeEach(() => {
  start.mockReset()
  stop.mockReset()
  retryNow.mockReset()
  secondsLeft.value = 0
  probing.value = false
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

  it('shows the seconds remaining until the next retry', async () => {
    secondsLeft.value = 5
    const wrapper = mountBanner()
    sessionState.unavailable = true
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-testid="connection-banner"]').text()).toContain('5s')
  })

  it('offers a retry-now action that triggers an immediate probe', async () => {
    const wrapper = mountBanner()
    sessionState.unavailable = true
    await wrapper.vm.$nextTick()
    await wrapper.find('[data-testid="connection-retry-now"]').trigger('click')
    expect(retryNow).toHaveBeenCalled()
  })

  it('shows "retrying…" without a countdown or button while a probe is in flight', async () => {
    probing.value = true
    secondsLeft.value = 0
    const wrapper = mountBanner()
    sessionState.unavailable = true
    await wrapper.vm.$nextTick()
    const banner = wrapper.find('[data-testid="connection-banner"]')
    expect(banner.text()).toContain('retrying…')
    expect(wrapper.find('[data-testid="connection-retry-now"]').exists()).toBe(false)
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
