import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const getMcpStatus = vi.fn()
const setMcpEnabled = vi.fn()
const regenerateMcpToken = vi.fn()
const revealMcpToken = vi.fn()
const clipboardWriteText = vi.fn()
const connectClaudeCode = vi.fn()
const connectCodex = vi.fn()
vi.mock('@/shared/lib/rpc', () => ({
  rpc: {
    getMcpStatus: () => getMcpStatus(),
    setMcpEnabled: (a: unknown) => setMcpEnabled(a),
    regenerateMcpToken: () => regenerateMcpToken(),
    revealMcpToken: () => revealMcpToken(),
    clipboardWriteText: (a: unknown) => clipboardWriteText(a),
    connectClaudeCode: () => connectClaudeCode(),
    connectCodex: () => connectCodex(),
  },
}))
const pushToast = vi.fn()
vi.mock('@/shared/composables/useToast', () => ({ pushToast: (a: unknown) => pushToast(a) }))
vi.mock('@/shared/composables/useConfirm', () => ({
  useConfirm: () => ({ confirm: () => Promise.resolve(true) }),
}))

import AgentAccessPane from './AgentAccessPane.vue'

beforeEach(() => {
  vi.clearAllMocks()
  getMcpStatus.mockResolvedValue({ enabled: true, port: 7437, running: true, hasToken: true })
  setMcpEnabled.mockResolvedValue({ ok: true })
  regenerateMcpToken.mockResolvedValue({ token: 'lmcp_new' })
  revealMcpToken.mockResolvedValue({ token: 'lmcp_existing' })
  connectClaudeCode.mockResolvedValue({ ok: true, method: 'cli' })
  connectCodex.mockResolvedValue({ ok: true, method: 'file' })
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

describe('AgentAccessPane connect cards', () => {
  it('renders Claude Code and Codex snippets with the real token once enabled', async () => {
    const w = mount(AgentAccessPane)
    await flushPromises()
    expect(w.text()).toContain('Claude Code')
    expect(w.text()).toContain('Codex')
    expect(w.text()).toContain('claude mcp add')
    expect(w.text()).toContain('[mcp_servers.lumen]')
    expect(revealMcpToken).toHaveBeenCalled()
  })

  it('gates the cards when MCP is disabled', async () => {
    getMcpStatus.mockResolvedValue({ enabled: false, port: 7437, running: false, hasToken: false })
    const w = mount(AgentAccessPane)
    await flushPromises()
    expect(w.text()).toContain('Enable agent access first')
    expect(w.text()).not.toContain('claude mcp add')
  })

  it('Connect on the Claude card confirms then calls connectClaudeCode', async () => {
    const w = mount(AgentAccessPane)
    await flushPromises()
    await w.find('[data-testid="connect-claude"]').trigger('click')
    await flushPromises()
    expect(connectClaudeCode).toHaveBeenCalled()
  })

  it('Connect on the Codex card calls connectCodex', async () => {
    const w = mount(AgentAccessPane)
    await flushPromises()
    await w.find('[data-testid="connect-codex"]').trigger('click')
    await flushPromises()
    expect(connectCodex).toHaveBeenCalled()
  })

  it('shows a failed toast when a connect RPC reports an error', async () => {
    connectClaudeCode.mockResolvedValue({ ok: false, error: 'claude mcp add failed' })
    const w = mount(AgentAccessPane)
    await flushPromises()
    await w.find('[data-testid="connect-claude"]').trigger('click')
    await flushPromises()
    expect(pushToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Connect failed', tone: 'failed' }),
    )
  })

  it('keeps the re-connect hint when a connect fails after a token regenerate', async () => {
    connectClaudeCode.mockResolvedValue({ ok: false, error: 'boom' })
    const w = mount(AgentAccessPane)
    await flushPromises()
    await w.find('[data-testid="mcp-regenerate"]').trigger('click')
    await flushPromises()
    expect(w.text()).toContain('re-run Connect')
    await w.find('[data-testid="connect-claude"]').trigger('click')
    await flushPromises()
    expect(w.text()).toContain('re-run Connect')
  })
})
