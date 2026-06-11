import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  cacheSnapshot,
  getSnapshot,
  setHostActions,
  getHostActions,
  buildCommandJs,
  __resetBridge,
  type HostActions,
} from './bridge'
import type { AppStateSnapshot } from '@/shared/lib/rpcContract'

const SNAP: AppStateSnapshot = {
  route: '/projects/a/b/issues',
  view: 'issues',
  projectPath: 'a/b',
  selectedIssueIids: ['1'],
  visibleIssueIids: ['1', '2'],
}

beforeEach(() => __resetBridge())

describe('snapshot cache', () => {
  it('is null before the first report', () => {
    expect(getSnapshot()).toBeNull()
  })
  it('returns the latest cached snapshot', () => {
    cacheSnapshot(SNAP)
    cacheSnapshot({ ...SNAP, view: 'home', route: '/' })
    expect(getSnapshot()?.view).toBe('home')
  })
})

describe('host actions', () => {
  it('is null until the host registers', () => {
    expect(getHostActions()).toBeNull()
  })
  it('returns the registered actions object', () => {
    const host: HostActions = {
      openIssueWindow: vi.fn(() => ({ ok: true })),
      openIssuesWindow: vi.fn(() => ({ ok: true })),
      openSettingsWindow: vi.fn(() => ({ ok: true })),
      notify: vi.fn(),
      driveMain: vi.fn(() => ({ ok: true })),
      listWindows: vi.fn(() => []),
    }
    setHostActions(host)
    expect(getHostActions()).toBe(host)
  })
})

describe('buildCommandJs', () => {
  it('dispatches a lumen:mcp-command CustomEvent with the command as detail', () => {
    const js = buildCommandJs({ cmd: 'navigate', view: 'issues', project: 'a/b' })
    expect(js).toBe(
      `window.dispatchEvent(new CustomEvent('lumen:mcp-command',{detail:{"cmd":"navigate","view":"issues","project":"a/b"}}))`,
    )
  })
  it('JSON-escapes quote and backslash injection attempts', () => {
    const js = buildCommandJs({
      cmd: 'navigate',
      view: 'issue',
      project: `a"})); alert(1); ("`,
      iid: '5',
    })
    // The hostile string must stay inside the JSON string literal.
    expect(js).toContain('\\"})); alert(1); (\\"')
    expect(js.startsWith('window.dispatchEvent(')).toBe(true)
  })
})
