import { describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ref } from 'vue'

const replace = vi.fn()
vi.mock('vue-router', () => ({ useRouter: () => ({ replace }) }))

const { save } = vi.hoisted(() => ({ save: vi.fn() }))
vi.mock('@/shared/composables/useGitlabConnect', () => ({
  useGitlabConnect: () => ({
    url: ref(''),
    token: ref(''),
    tokenSuffix: ref(''),
    tokenPlaceholder: ref(''),
    status: ref('idle'),
    message: ref(''),
    testing: ref(false),
    canSubmit: ref(true),
    loadUrl: vi.fn(),
    save,
  }),
}))

import ConnectView from './ConnectView.vue'

describe('ConnectView', () => {
  it('redirects to My Work (home) after a successful connect', async () => {
    save.mockResolvedValue(true)
    const w = mount(ConnectView)
    await w.find('form').trigger('submit')
    await flushPromises()
    expect(replace).toHaveBeenCalledWith({ name: 'home' })
  })

  it('stays put when the connect probe fails', async () => {
    replace.mockClear()
    save.mockResolvedValue(false)
    const w = mount(ConnectView)
    await w.find('form').trigger('submit')
    await flushPromises()
    expect(replace).not.toHaveBeenCalled()
  })
})
