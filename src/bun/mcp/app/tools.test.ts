import { describe, it, expect, beforeEach, vi } from 'vitest'
import { z } from 'zod'
import { appTools } from './tools'
import { setHostActions, cacheSnapshot, __resetBridge, type HostActions } from './bridge'
import type { CallToolResult } from '../types'

function tool(name: string) {
  const t = appTools.find((t) => t.name === name)
  if (!t) throw new Error(`tool ${name} not found`)
  return t
}

function body(r: CallToolResult): string {
  const c = r.content[0]
  return c?.type === 'text' ? c.text : ''
}

function stubHost(overrides: Partial<HostActions> = {}): HostActions {
  const host: HostActions = {
    openIssueWindow: vi.fn(() => ({ ok: true })),
    openIssuesWindow: vi.fn(() => ({ ok: true })),
    openSettingsWindow: vi.fn(() => ({ ok: true })),
    notify: vi.fn(),
    driveMain: vi.fn(() => ({ ok: true })),
    broadcast: vi.fn(),
    listWindows: vi.fn(() => [{ kind: 'main' as const }]),
    ...overrides,
  }
  setHostActions(host)
  return host
}

beforeEach(() => __resetBridge())

it('exposes exactly the six lumen_app_ tools', () => {
  expect(appTools.map((t) => t.name).sort()).toEqual([
    'lumen_app_navigate',
    'lumen_app_notify',
    'lumen_app_open_issue',
    'lumen_app_open_issues_window',
    'lumen_app_open_settings',
    'lumen_app_state',
  ])
})

it('every tool errors cleanly when the bridge is uninitialized', async () => {
  for (const t of appTools) {
    const r = await t.handler({
      view: 'dashboard',
      project: 'a/b',
      iid: '1',
      iids: ['1'],
      title: 'x',
    })
    expect(r.isError).toBe(true)
    expect(body(r)).toContain('bridge not initialized')
  }
})

describe('lumen_app_state', () => {
  it('returns null snapshot + window list before any report', async () => {
    stubHost()
    const r = await tool('lumen_app_state').handler({})
    expect(JSON.parse(body(r))).toEqual({ snapshot: null, windows: [{ kind: 'main' }] })
  })
  it('returns the cached snapshot', async () => {
    stubHost()
    cacheSnapshot({
      route: '/',
      view: 'home',
      projectPath: null,
      selectedIssueIids: [],
      visibleIssueIids: [],
    })
    const r = await tool('lumen_app_state').handler({})
    expect(JSON.parse(body(r)).snapshot.view).toBe('home')
  })
})

describe('lumen_app_navigate', () => {
  it('drives the main window with a navigate command', async () => {
    const host = stubHost()
    const r = await tool('lumen_app_navigate').handler({ view: 'issues', project: 'a/b' })
    expect(r.isError).toBeUndefined()
    expect(host.driveMain).toHaveBeenCalledWith(
      expect.stringContaining('"cmd":"navigate","view":"issues","project":"a/b"'),
    )
  })
  it('requires project for project-scoped views', async () => {
    stubHost()
    const r = await tool('lumen_app_navigate').handler({ view: 'issues' })
    expect(r.isError).toBe(true)
    expect(body(r)).toContain("requires 'project'")
  })
  it('requires iid for detail views', async () => {
    stubHost()
    const r = await tool('lumen_app_navigate').handler({ view: 'issue', project: 'a/b' })
    expect(r.isError).toBe(true)
    expect(body(r)).toContain("requires 'iid'")
  })
  it('reports a note when the main window is gone (not an error)', async () => {
    stubHost({ driveMain: vi.fn(() => ({ ok: false })) })
    const r = await tool('lumen_app_navigate').handler({ view: 'dashboard' })
    expect(r.isError).toBeUndefined()
    expect(JSON.parse(body(r))).toEqual({ ok: false, note: 'main window not open' })
  })
})

describe('window openers', () => {
  it('lumen_app_open_issue calls the host opener directly', async () => {
    const host = stubHost()
    const r = await tool('lumen_app_open_issue').handler({ project: 'a/b', iid: '7' })
    expect(host.openIssueWindow).toHaveBeenCalledWith({ fullPath: 'a/b', iid: '7' })
    expect(JSON.parse(body(r)).ok).toBe(true)
  })
  it('lumen_app_open_issues_window passes the iid list', async () => {
    const host = stubHost()
    await tool('lumen_app_open_issues_window').handler({ project: 'a/b', iids: ['1', '2'] })
    expect(host.openIssuesWindow).toHaveBeenCalledWith({ fullPath: 'a/b', iids: ['1', '2'] })
  })
  it('lumen_app_open_settings takes no args', async () => {
    const host = stubHost()
    await tool('lumen_app_open_settings').handler({})
    expect(host.openSettingsWindow).toHaveBeenCalled()
  })
})

describe('lumen_app_notify', () => {
  it('forwards to the host notifier', async () => {
    const host = stubHost()
    await tool('lumen_app_notify').handler({ title: 'Hi', body: 'there', silent: true })
    expect(host.notify).toHaveBeenCalledWith({
      title: 'Hi',
      body: 'there',
      subtitle: undefined,
      silent: true,
    })
  })

  it('normalizes notification text before forwarding', async () => {
    const host = stubHost()
    await tool('lumen_app_notify').handler({
      title: '  \n ',
      body: ' body\ntext ',
      subtitle: 'x'.repeat(200),
    })
    expect(host.notify).toHaveBeenCalledWith({
      title: 'Lumen',
      body: 'body text',
      subtitle: expect.stringMatching(/^x+\.\.\.$/),
    })
  })
})

it('iid schemas reject non-numeric iids', () => {
  const nav = tool('lumen_app_navigate').inputSchema
  expect(z.object(nav).safeParse({ view: 'issue', project: 'a/b', iid: 'abc' }).success).toBe(false)
  const open = tool('lumen_app_open_issue').inputSchema
  expect(z.object(open).safeParse({ project: 'a/b', iid: '12' }).success).toBe(true)
  expect(z.object(open).safeParse({ project: 'a/b', iid: 'x' }).success).toBe(false)
})
