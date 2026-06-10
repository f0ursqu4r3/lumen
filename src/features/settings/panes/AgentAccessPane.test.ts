import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const getMcpStatus = vi.fn()
const setMcpEnabled = vi.fn()
const regenerateMcpToken = vi.fn()
const revealMcpToken = vi.fn()
const clipboardWriteText = vi.fn()
vi.mock('@/shared/lib/rpc', () => ({
  rpc: {
    getMcpStatus: () => getMcpStatus(),
    setMcpEnabled: (a: unknown) => setMcpEnabled(a),
    regenerateMcpToken: () => regenerateMcpToken(),
    revealMcpToken: () => revealMcpToken(),
    clipboardWriteText: (a: unknown) => clipboardWriteText(a),
  },
}))
const pushToast = vi.fn()
vi.mock('@/shared/composables/useToast', () => ({ pushToast: (a: unknown) => pushToast(a) }))

import AgentAccessPane from './AgentAccessPane.vue'

beforeEach(() => {
  vi.clearAllMocks()
  getMcpStatus.mockResolvedValue({ enabled: true, port: 7437, running: true, hasToken: true })
  setMcpEnabled.mockResolvedValue({ ok: true })
  regenerateMcpToken.mockResolvedValue({ token: 'lmcp_new' })
  revealMcpToken.mockResolvedValue({ token: 'lmcp_existing' })
})

describe('AgentAccessPane', () => {
  it('shows the running status from getMcpStatus', async () => {
    const w = mount(AgentAccessPane)
    await flushPromises()
    expect(w.text()).toContain('Running')
    expect(w.text()).toContain('7437')
  })

  it('toggling enable calls setMcpEnabled and refreshes status', async () => {
    const w = mount(AgentAccessPane)
    await flushPromises()
    await w.find('[data-testid="mcp-enable"]').trigger('click')
    await flushPromises()
    expect(setMcpEnabled).toHaveBeenCalledWith({ enabled: false, port: 7437 })
    expect(getMcpStatus).toHaveBeenCalledTimes(2)
  })

  it('regenerate rotates the token and copies it', async () => {
    const w = mount(AgentAccessPane)
    await flushPromises()
    await w.find('[data-testid="mcp-regenerate"]').trigger('click')
    await flushPromises()
    expect(regenerateMcpToken).toHaveBeenCalled()
    expect(clipboardWriteText).toHaveBeenCalledWith({ text: 'lmcp_new' })
  })

  it('surfaces a port-in-use error from setMcpEnabled', async () => {
    setMcpEnabled.mockResolvedValue({ ok: false, error: 'EADDRINUSE' })
    getMcpStatus.mockResolvedValue({ enabled: false, port: 7437, running: false, hasToken: true })
    const w = mount(AgentAccessPane)
    await flushPromises()
    await w.find('[data-testid="mcp-enable"]').trigger('click')
    await flushPromises()
    expect(w.text()).toContain('already in use')
  })
})
