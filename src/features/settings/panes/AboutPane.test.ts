import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const gitlabGraphql = vi.fn()
vi.mock('@/shared/lib/rpc', () => ({ rpc: { gitlabGraphql: (a: unknown) => gitlabGraphql(a) } }))
vi.mock('@/shared/composables/useGitlabConnect', () => ({
  PROBE_QUERY: 'query{currentUser{username}}',
}))

import AboutPane from './AboutPane.vue'

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('__APP_VERSION__', '9.9.9')
  gitlabGraphql.mockResolvedValue({ status: 200, data: { currentUser: { username: 'kyle' } } })
})

describe('AboutPane', () => {
  it('shows the version and identity', async () => {
    const w = mount(AboutPane)
    await flushPromises()
    expect(w.text()).toContain('9.9.9')
    expect(w.text()).toContain('kyle')
  })
})
