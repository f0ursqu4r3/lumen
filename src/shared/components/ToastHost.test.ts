import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const { openExternal } = vi.hoisted(() => ({
  openExternal: vi.fn(() => Promise.resolve({ ok: true })),
}))
vi.mock('@/lib/rpc', () => ({ rpc: { openExternal } }))

import ToastHost from './ToastHost.vue'
import { pushToast, clearToasts, toasts } from '@/shared/composables/useToast'

beforeEach(() => {
  clearToasts()
  openExternal.mockClear()
})

describe('ToastHost', () => {
  it('renders queued toasts with title and description', async () => {
    pushToast({ title: 'Pipeline passed', description: 'proj · main · #7', tone: 'success' })
    const w = mount(ToastHost)
    await flushPromises()
    expect(w.text()).toContain('Pipeline passed')
    expect(w.text()).toContain('proj · main · #7')
  })

  it('clicking a toast with an href opens it externally and dismisses it', async () => {
    pushToast({ title: 'Done', href: 'https://gl/42', duration: 0 })
    const w = mount(ToastHost)
    await flushPromises()
    await w.get('button[type="button"]').trigger('click')
    expect(openExternal).toHaveBeenCalledWith({ url: 'https://gl/42' })
    expect(toasts.value).toHaveLength(0)
  })

  it('the dismiss button removes the toast without opening anything', async () => {
    pushToast({ title: 'Nope', href: 'https://gl/1', duration: 0 })
    const w = mount(ToastHost)
    await flushPromises()
    await w.get('button[aria-label^="Dismiss"]').trigger('click')
    expect(openExternal).not.toHaveBeenCalled()
    expect(toasts.value).toHaveLength(0)
  })
})
