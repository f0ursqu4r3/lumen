import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createDeepLinkRouter, buildDeepLinkJs, type DeepLinkHost } from './deepLinkHost'

function stubHost(open: Set<string> = new Set()) {
  return {
    hasIssueWindow: vi.fn((key: string) => open.has(key)),
    focusIssueWindow: vi.fn(),
    focusMain: vi.fn(),
    driveMain: vi.fn(() => ({ ok: true })),
  } satisfies DeepLinkHost
}

describe('buildDeepLinkJs', () => {
  it('dispatches a lumen:deeplink CustomEvent with the JSON location', () => {
    const js = buildDeepLinkJs({
      name: 'issues',
      params: { fullPath: 'g/r' },
      query: { issue: '1' },
    })
    expect(js).toContain('lumen:deeplink')
    expect(js).toContain('"fullPath":"g/r"')
  })
})

describe('createDeepLinkRouter', () => {
  let host: ReturnType<typeof stubHost>
  beforeEach(() => {
    host = stubHost()
  })

  it('reuses an open popout for an issue link instead of routing the main window', () => {
    host = stubHost(new Set(['group/repo#42']))
    const router = createDeepLinkRouter(host)
    router.markReady()
    router.handleOpenUrl('lumen://issue/group/repo/42')
    expect(host.focusIssueWindow).toHaveBeenCalledWith('group/repo#42')
    expect(host.focusMain).not.toHaveBeenCalled()
    expect(host.driveMain).not.toHaveBeenCalled()
  })

  it('focuses main and forwards the location when no popout is open', () => {
    const router = createDeepLinkRouter(host)
    router.markReady()
    router.handleOpenUrl('lumen://issue/group/repo/42')
    expect(host.focusMain).toHaveBeenCalled()
    expect(host.driveMain).toHaveBeenCalledTimes(1)
    expect(host.driveMain).toHaveBeenCalledWith(expect.stringContaining('"issue":"42"'))
  })

  it('forwards a filtered issues-list location', () => {
    const router = createDeepLinkRouter(host)
    router.markReady()
    router.handleOpenUrl('lumen://issues/group/repo?state=opened')
    expect(host.driveMain).toHaveBeenCalledWith(expect.stringContaining('"state":"opened"'))
  })

  it('focuses main only for a focus intent (no route forwarded)', () => {
    const router = createDeepLinkRouter(host)
    router.markReady()
    router.handleOpenUrl('lumen://app/current')
    expect(host.focusMain).toHaveBeenCalled()
    expect(host.driveMain).not.toHaveBeenCalled()
  })

  it('buffers links that arrive before ready, then flushes on markReady', () => {
    const router = createDeepLinkRouter(host)
    router.handleOpenUrl('lumen://issue/group/repo/42') // before ready
    expect(host.focusMain).not.toHaveBeenCalled()
    expect(host.driveMain).not.toHaveBeenCalled()
    router.markReady()
    expect(host.focusMain).toHaveBeenCalled()
    expect(host.driveMain).toHaveBeenCalledTimes(1)
  })

  it('flushes multiple buffered links in order on markReady', () => {
    const router = createDeepLinkRouter(host)
    router.handleOpenUrl('lumen://app/current') // focus intent
    router.handleOpenUrl('lumen://issue/group/repo/42') // issue intent
    expect(host.focusMain).not.toHaveBeenCalled()
    expect(host.driveMain).not.toHaveBeenCalled()
    router.markReady()
    // both flushed: focus intent → focusMain only; issue intent → focusMain + driveMain
    expect(host.focusMain).toHaveBeenCalledTimes(2)
    expect(host.driveMain).toHaveBeenCalledTimes(1)
    expect(host.driveMain).toHaveBeenCalledWith(expect.stringContaining('"issue":"42"'))
  })

  it('markReady is idempotent', () => {
    const router = createDeepLinkRouter(host)
    router.markReady()
    router.markReady()
    router.handleOpenUrl('lumen://issue/group/repo/42')
    expect(host.driveMain).toHaveBeenCalledTimes(1)
  })
})
