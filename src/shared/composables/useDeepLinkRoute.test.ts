import { describe, it, expect, vi, afterEach } from 'vitest'
import type { Router } from 'vue-router'
import { installDeepLinkRoute, __resetDeepLinkRoute } from './useDeepLinkRoute'

function stubRouter() {
  return { push: vi.fn().mockResolvedValue(undefined) } as unknown as Router
}

afterEach(() => __resetDeepLinkRoute())

function emit(detail: unknown) {
  window.dispatchEvent(new CustomEvent('lumen:deeplink', { detail }))
}

describe('installDeepLinkRoute', () => {
  it('pushes the forwarded location onto the router', () => {
    const router = stubRouter()
    installDeepLinkRoute(router)
    const location = { name: 'issues', params: { fullPath: 'g/r' }, query: { issue: '42' } }
    emit(location)
    expect(router.push).toHaveBeenCalledWith(location)
  })

  it('ignores a null detail', () => {
    const router = stubRouter()
    installDeepLinkRoute(router)
    emit(null)
    expect(router.push).not.toHaveBeenCalled()
  })

  it('ignores a non-object detail', () => {
    const router = stubRouter()
    installDeepLinkRoute(router)
    emit('nope')
    expect(router.push).not.toHaveBeenCalled()
  })

  it('stops listening after reset', () => {
    const router = stubRouter()
    installDeepLinkRoute(router)
    __resetDeepLinkRoute()
    emit({ name: 'issues', params: { fullPath: 'g/r' }, query: {} })
    expect(router.push).not.toHaveBeenCalled()
  })

  it('installs once (a second call does not double-fire)', () => {
    const router = stubRouter()
    installDeepLinkRoute(router)
    installDeepLinkRoute(router)
    emit({ name: 'issues', params: { fullPath: 'g/r' }, query: {} })
    expect(router.push).toHaveBeenCalledTimes(1)
  })
})
