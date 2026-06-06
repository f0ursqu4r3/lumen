import { describe, it, expect, vi, beforeEach } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { withQuery } from '@/test/withQuery'

const getConfig = vi.fn()
vi.mock('@/lib/rpc', () => ({ rpc: { getConfig: () => getConfig() } }))

import { useGitlabUrl } from './useGitlabUrl'

beforeEach(() => getConfig.mockReset())

describe('useGitlabUrl', () => {
  it('absolutizes a relative path against the configured host (trailing slash trimmed)', async () => {
    getConfig.mockResolvedValue({ url: 'https://gitlab.example.com/', configured: true })
    const { result } = withQuery(() => useGitlabUrl())
    await flushPromises()
    expect(result().toAbsolute('/g/p/-/pipelines/1')).toBe(
      'https://gitlab.example.com/g/p/-/pipelines/1',
    )
  })

  it('returns null when the base URL or path is missing', async () => {
    getConfig.mockResolvedValue({ url: null, configured: false })
    const { result } = withQuery(() => useGitlabUrl())
    await flushPromises()
    expect(result().toAbsolute('/x')).toBeNull()
  })
})
