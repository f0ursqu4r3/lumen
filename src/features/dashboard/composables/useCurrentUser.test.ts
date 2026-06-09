import { describe, it, expect, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { withQuery } from '@/test/withQuery'

const request = vi.fn()
vi.mock('@/gitlab/client', () => ({ gqlClient: { request: (...a: unknown[]) => request(...a) } }))

import { useCurrentUser } from './useCurrentUser'

describe('useCurrentUser', () => {
  it('returns the username', async () => {
    request.mockReset()
    request.mockResolvedValue({ currentUser: { username: 'ada' } })
    const { result } = withQuery(() => useCurrentUser())
    await flushPromises()
    expect(result().data.value).toBe('ada')
  })

  it('normalizes errors', async () => {
    request.mockReset()
    request.mockRejectedValue(new Error('boom'))
    const { result } = withQuery(() => useCurrentUser())
    await flushPromises()
    expect(result().error.value).toMatchObject({ kind: 'unknown', message: 'boom' })
  })
})
