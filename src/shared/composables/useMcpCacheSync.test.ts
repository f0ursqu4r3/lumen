import { describe, it, expect, beforeEach, afterEach, vi, type MockInstance } from 'vitest'
import { QueryClient } from '@tanstack/vue-query'
import { installMcpCacheSync, __resetMcpCacheSync } from './useMcpCacheSync'

function dispatch(detail: unknown) {
  window.dispatchEvent(new CustomEvent('lumen:mcp-command', { detail }))
}

let qc: QueryClient
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let spy: MockInstance<any>

beforeEach(() => {
  qc = new QueryClient()
  spy = vi.spyOn(qc, 'invalidateQueries').mockResolvedValue(undefined)
  installMcpCacheSync(qc)
})
afterEach(() => __resetMcpCacheSync())

describe('installMcpCacheSync', () => {
  it('invalidates the list and the issue/status keys when iid is present', () => {
    dispatch({ cmd: 'invalidate', resource: 'issue', project: 'a/b', iid: '5' })
    expect(spy).toHaveBeenCalledWith({ queryKey: ['issues', 'a/b'] })
    expect(spy).toHaveBeenCalledWith({ queryKey: ['issue', 'a/b', '5'] })
    expect(spy).toHaveBeenCalledWith({ queryKey: ['workItemStatus', 'a/b', '5'] })
  })

  it('invalidates only the list when iid is absent', () => {
    dispatch({ cmd: 'invalidate', resource: 'issue', project: 'a/b' })
    expect(spy).toHaveBeenCalledWith({ queryKey: ['issues', 'a/b'] })
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('ignores navigate and unknown commands', () => {
    dispatch({ cmd: 'navigate', view: 'issues', project: 'a/b' })
    dispatch({ cmd: 'invalidate', resource: 'merge_request', project: 'a/b' })
    expect(spy).not.toHaveBeenCalled()
  })
})
