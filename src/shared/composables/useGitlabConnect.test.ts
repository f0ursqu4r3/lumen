import { describe, it, expect, vi, beforeEach } from 'vitest'

const getConfig = vi.fn()
const saveConfig = vi.fn()
const gitlabGraphql = vi.fn()
vi.mock('@/shared/lib/rpc', () => ({
  rpc: {
    getConfig: () => getConfig(),
    saveConfig: (a: unknown) => saveConfig(a),
    gitlabGraphql: (a: unknown) => gitlabGraphql(a),
  },
}))

import { useGitlabConnect } from './useGitlabConnect'

beforeEach(() => {
  getConfig.mockReset()
  saveConfig.mockReset()
  gitlabGraphql.mockReset()
  getConfig.mockResolvedValue({ url: '', configured: false })
})

describe('useGitlabConnect', () => {
  it('saves config and resolves true on a clean probe', async () => {
    saveConfig.mockResolvedValue({ ok: true })
    gitlabGraphql.mockResolvedValue({ status: 200, errors: [] })
    const c = useGitlabConnect()
    c.url.value = 'https://gitlab.example.com'
    c.token.value = 'glpat-x'
    await expect(c.save()).resolves.toBe(true)
    expect(saveConfig).toHaveBeenCalledWith({
      url: 'https://gitlab.example.com',
      token: 'glpat-x',
    })
    expect(c.status.value).toBe('idle')
  })

  it('surfaces a GraphQL error and resolves false', async () => {
    saveConfig.mockResolvedValue({ ok: true })
    gitlabGraphql.mockResolvedValue({ status: 200, errors: [{ message: 'bad token' }] })
    const c = useGitlabConnect()
    c.url.value = 'https://x'
    c.token.value = 'glpat-x'
    await expect(c.save()).resolves.toBe(false)
    expect(c.status.value).toBe('error')
    expect(c.message.value).toBe('bad token')
  })

  it('does not submit without both url and token', async () => {
    const c = useGitlabConnect()
    c.url.value = ''
    c.token.value = 'glpat-x'
    await expect(c.save()).resolves.toBe(false)
    expect(saveConfig).not.toHaveBeenCalled()
  })

  it('shows a token-rejected message on 401', async () => {
    saveConfig.mockResolvedValue({ ok: true })
    gitlabGraphql.mockResolvedValue({ status: 401 })
    const c = useGitlabConnect()
    c.url.value = 'https://x'
    c.token.value = 'glpat-x'
    await expect(c.save()).resolves.toBe(false)
    expect(c.status.value).toBe('error')
    expect(c.message.value).toMatch(/token/i)
    expect(c.message.value).toMatch(/api/)
  })

  it('shows an unreachable-server message on 5xx', async () => {
    saveConfig.mockResolvedValue({ ok: true })
    gitlabGraphql.mockResolvedValue({ status: 503 })
    const c = useGitlabConnect()
    c.url.value = 'https://gitlab.example.com'
    c.token.value = 'glpat-x'
    await expect(c.save()).resolves.toBe(false)
    expect(c.status.value).toBe('error')
    expect(c.message.value).toMatch(/reach/i)
    expect(c.message.value).toContain('gitlab.example.com')
  })

  it('treats a thrown rpc as unreachable', async () => {
    saveConfig.mockResolvedValue({ ok: true })
    gitlabGraphql.mockRejectedValue(new Error('ECONNREFUSED'))
    const c = useGitlabConnect()
    c.url.value = 'https://gitlab.example.com'
    c.token.value = 'glpat-x'
    await expect(c.save()).resolves.toBe(false)
    expect(c.message.value).toMatch(/reach/i)
  })
})
