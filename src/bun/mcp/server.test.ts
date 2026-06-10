import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const { loadConfig, saveMcpConfig } = vi.hoisted(() => ({
  loadConfig: vi.fn(),
  saveMcpConfig: vi.fn(),
}))
vi.mock('../config', () => ({ loadConfig, saveMcpConfig }))

import {
  startMcp,
  stopMcp,
  startMcpIfEnabled,
  isRunning,
  getMcpStatus,
  regenerateMcpToken,
  revealMcpToken,
  setMcpEnabled,
} from './server'

const fakeServe = vi.fn((_opts: { hostname: string; port: number; fetch: unknown }) => ({
  stop: vi.fn(),
}))

beforeEach(() => {
  loadConfig.mockReset()
  saveMcpConfig.mockReset()
  fakeServe.mockClear()
  vi.stubGlobal('Bun', { serve: fakeServe })
})
afterEach(() => {
  stopMcp()
  vi.unstubAllGlobals()
})

describe('mcp server lifecycle', () => {
  it('startMcp binds 127.0.0.1 on the given port and reports running', () => {
    const r = startMcp(7437, 'tok')
    expect(r).toEqual({ ok: true })
    expect(fakeServe).toHaveBeenCalledTimes(1)
    expect(fakeServe.mock.calls[0][0]).toMatchObject({ hostname: '127.0.0.1', port: 7437 })
    expect(isRunning()).toBe(true)
  })

  it('startMcp is idempotent (a second call does not re-serve)', () => {
    startMcp(7437, 'tok')
    startMcp(7437, 'tok')
    expect(fakeServe).toHaveBeenCalledTimes(1)
  })

  it('reports a port-in-use error instead of throwing', () => {
    fakeServe.mockImplementationOnce(() => {
      throw new Error('EADDRINUSE')
    })
    const r = startMcp(7437, 'tok')
    expect(r.ok).toBe(false)
    expect(isRunning()).toBe(false)
  })

  it('startMcpIfEnabled starts only when enabled with a token', () => {
    loadConfig.mockReturnValue({ mcp: { enabled: false, port: 7437, token: 'tok' } })
    startMcpIfEnabled()
    expect(fakeServe).not.toHaveBeenCalled()

    loadConfig.mockReturnValue({ mcp: { enabled: true, port: 7437, token: null } })
    startMcpIfEnabled()
    expect(fakeServe).not.toHaveBeenCalled()

    loadConfig.mockReturnValue({ mcp: { enabled: true, port: 7437, token: 'tok' } })
    startMcpIfEnabled()
    expect(fakeServe).toHaveBeenCalledTimes(1)
  })
})

describe('mcp status & token control', () => {
  it('getMcpStatus reflects config + running state', () => {
    loadConfig.mockReturnValue({ mcp: { enabled: true, port: 7437, token: 'tok' } })
    expect(getMcpStatus()).toEqual({ enabled: true, port: 7437, running: false, hasToken: true })
  })

  it('getMcpStatus defaults when no mcp block', () => {
    loadConfig.mockReturnValue({ mcp: null })
    expect(getMcpStatus()).toEqual({ enabled: false, port: 7437, running: false, hasToken: false })
  })

  it('setMcpEnabled generates a token when enabling without one', () => {
    loadConfig.mockReturnValue({ mcp: { enabled: false, port: 7437, token: null } })
    const r = setMcpEnabled({ enabled: true, port: 7437 })
    expect(r.ok).toBe(true)
    const saved = saveMcpConfig.mock.calls.at(-1)![0]
    expect(saved.enabled).toBe(true)
    expect(saved.token).toMatch(/^lmcp_/)
  })

  it('regenerateMcpToken rotates the token, persists, and returns it', () => {
    loadConfig.mockReturnValue({ mcp: { enabled: true, port: 7437, token: 'old' } })
    const { token } = regenerateMcpToken()
    expect(token).toMatch(/^lmcp_/)
    expect(token).not.toBe('old')
    expect(saveMcpConfig.mock.calls.at(-1)![0].token).toBe(token)
  })

  it('revealMcpToken returns the current token (or null)', () => {
    loadConfig.mockReturnValue({ mcp: { enabled: true, port: 7437, token: 'tok' } })
    expect(revealMcpToken()).toEqual({ token: 'tok' })
    loadConfig.mockReturnValue({ mcp: null })
    expect(revealMcpToken()).toEqual({ token: null })
  })
})
