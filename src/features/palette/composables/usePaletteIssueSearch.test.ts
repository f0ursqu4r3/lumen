import { describe, it, expect, vi, beforeEach } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { ref } from 'vue'
import { withQuery } from '@/test/withQuery'

const request = vi.fn()
vi.mock('@/gitlab/client', () => ({
  gqlClient: { request: (...a: unknown[]) => request(...a) },
}))

import { paletteSearchEnabled, usePaletteIssueSearch } from './usePaletteIssueSearch'

beforeEach(() => {
  request.mockReset()
})

describe('paletteSearchEnabled', () => {
  it('is disabled without a project', () => {
    expect(paletteSearchEnabled('login', null)).toBe(false)
  })
  it('is disabled for queries under 2 characters', () => {
    expect(paletteSearchEnabled('a', 'grp/proj')).toBe(false)
  })
  it('is disabled for a pure issue number', () => {
    expect(paletteSearchEnabled('42', 'grp/proj')).toBe(false)
    expect(paletteSearchEnabled('#42', 'grp/proj')).toBe(false)
  })
  it('is enabled for a real text query with a project', () => {
    expect(paletteSearchEnabled('login bug', 'grp/proj')).toBe(true)
  })
})

describe('usePaletteIssueSearch', () => {
  it('returns mapped hits for a text query', async () => {
    request.mockResolvedValue({
      project: { issues: { nodes: [{ iid: '3', title: 'Fix login', state: 'opened' }] } },
    })
    const { result } = withQuery(() => usePaletteIssueSearch(ref('login'), ref('grp/proj')))
    await new Promise((r) => setTimeout(r, 250))
    await flushPromises()
    expect(result().hits.value).toEqual([{ iid: '3', title: 'Fix login', state: 'opened' }])
  })

  it('exposes [] (never throws) when the search request fails', async () => {
    request.mockRejectedValue(new Error('boom'))
    const { result } = withQuery(() => usePaletteIssueSearch(ref('login'), ref('grp/proj')))
    await new Promise((r) => setTimeout(r, 250))
    await flushPromises()
    expect(result().hits.value).toEqual([])
  })

  it('does not fire a request when disabled', async () => {
    const { result } = withQuery(() => usePaletteIssueSearch(ref('#42'), ref('grp/proj')))
    await flushPromises()
    expect(request).not.toHaveBeenCalled()
    expect(result().hits.value).toEqual([])
  })
})
