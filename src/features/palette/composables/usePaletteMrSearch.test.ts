import { describe, it, expect, vi, beforeEach } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { ref } from 'vue'
import { withQuery } from '@/test/withQuery'

const request = vi.fn()
vi.mock('@/gitlab/client', () => ({
  gqlClient: { request: (...a: unknown[]) => request(...a) },
}))

import { paletteMrSearchEnabled, usePaletteMrSearch } from './usePaletteMrSearch'

beforeEach(() => {
  request.mockReset()
})

describe('paletteMrSearchEnabled', () => {
  it('is disabled without a project', () => {
    expect(paletteMrSearchEnabled('login', null)).toBe(false)
  })
  it('is disabled for queries under 2 characters', () => {
    expect(paletteMrSearchEnabled('a', 'grp/proj')).toBe(false)
  })
  it('is disabled for a pure number or !iid / #iid form', () => {
    expect(paletteMrSearchEnabled('42', 'grp/proj')).toBe(false)
    expect(paletteMrSearchEnabled('!42', 'grp/proj')).toBe(false)
    expect(paletteMrSearchEnabled('#42', 'grp/proj')).toBe(false)
  })
  it('is enabled for a real text query with a project', () => {
    expect(paletteMrSearchEnabled('login bug', 'grp/proj')).toBe(true)
  })
})

describe('usePaletteMrSearch', () => {
  it('returns mapped MR hits for a text query', async () => {
    request.mockResolvedValue({
      project: {
        mergeRequests: { nodes: [{ iid: '9', title: 'Refactor', state: 'opened', draft: false }] },
      },
    })
    const { result } = withQuery(() => usePaletteMrSearch(ref('login'), ref('grp/proj')))
    await new Promise((r) => setTimeout(r, 350))
    await flushPromises()
    expect(result().hits.value).toEqual([
      { iid: '9', title: 'Refactor', state: 'opened', draft: false },
    ])
  })

  it('exposes [] (never throws) when the search request fails', async () => {
    request.mockRejectedValue(new Error('boom'))
    const { result } = withQuery(() => usePaletteMrSearch(ref('login'), ref('grp/proj')))
    await new Promise((r) => setTimeout(r, 350))
    await flushPromises()
    expect(result().hits.value).toEqual([])
  })

  it('does not fire a request when disabled', async () => {
    const { result } = withQuery(() => usePaletteMrSearch(ref('!9'), ref('grp/proj')))
    await flushPromises()
    expect(request).not.toHaveBeenCalled()
    expect(result().hits.value).toEqual([])
  })
})
