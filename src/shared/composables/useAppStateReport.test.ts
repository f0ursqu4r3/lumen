import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createRouter, createMemoryHistory, type Router } from 'vue-router'
import {
  installAppStateReport,
  setReportedIssueIids,
  clearReportedIssueIids,
  __resetAppStateReport,
} from './useAppStateReport'

const reportAppState = vi.fn(async () => ({ ok: true as const }))
vi.mock('@/shared/lib/rpc', () => ({
  rpc: { reportAppState: (a: unknown) => reportAppState(a) },
}))

const Stub = { template: '<div />' }

function makeRouter(): Router {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'home', component: Stub },
      { path: '/projects', name: 'projects', component: Stub },
      { path: '/projects/:fullPath(.*)/issues', name: 'issues', component: Stub },
      { path: '/projects/:fullPath(.*)/issues/:iid', name: 'issue', component: Stub },
      { path: '/projects/:fullPath(.*)/merge-requests', name: 'merge-requests', component: Stub },
      {
        path: '/projects/:fullPath(.*)/merge-requests/:iid',
        name: 'merge-request',
        component: Stub,
      },
      { path: '/projects/:fullPath(.*)/pipelines', name: 'pipelines', component: Stub },
    ],
  })
}

function dispatch(detail: unknown) {
  window.dispatchEvent(new CustomEvent('lumen:mcp-command', { detail }))
}

let router: Router

beforeEach(async () => {
  vi.useFakeTimers()
  reportAppState.mockClear()
  __resetAppStateReport()
  router = makeRouter()
  await router.push('/')
  installAppStateReport(router)
})

afterEach(() => {
  vi.useRealTimers()
  __resetAppStateReport()
})

describe('state reporting', () => {
  it('reports once after the debounce window', async () => {
    await vi.advanceTimersByTimeAsync(200)
    expect(reportAppState).toHaveBeenCalledTimes(1)
    expect(reportAppState).toHaveBeenCalledWith({
      route: '/',
      view: 'home',
      projectPath: null,
      selectedIssueIids: [],
      visibleIssueIids: [],
    })
  })

  it('coalesces a route change + iid change into one trailing report', async () => {
    await vi.advanceTimersByTimeAsync(200)
    reportAppState.mockClear()
    await router.push('/projects/a/b/issues')
    setReportedIssueIids(['3'], ['3', '4'])
    await vi.advanceTimersByTimeAsync(200)
    expect(reportAppState).toHaveBeenCalledTimes(1)
    expect(reportAppState).toHaveBeenCalledWith({
      route: '/projects/a/b/issues',
      view: 'issues',
      projectPath: 'a/b',
      selectedIssueIids: ['3'],
      visibleIssueIids: ['3', '4'],
    })
  })

  it('clearReportedIssueIids empties the iid arrays in the next report', async () => {
    setReportedIssueIids(['3'], ['3'])
    await vi.advanceTimersByTimeAsync(200)
    reportAppState.mockClear()
    clearReportedIssueIids()
    await vi.advanceTimersByTimeAsync(200)
    expect(reportAppState).toHaveBeenCalledWith(
      expect.objectContaining({ selectedIssueIids: [], visibleIssueIids: [] }),
    )
  })
})

describe('command listener', () => {
  it('navigates to a project-scoped view', async () => {
    dispatch({ cmd: 'navigate', view: 'issues', project: 'a/b' })
    await vi.runAllTimersAsync()
    expect(router.currentRoute.value.name).toBe('issues')
    expect(router.currentRoute.value.params.fullPath).toBe('a/b')
  })
  it('navigates to an issue detail with iid', async () => {
    dispatch({ cmd: 'navigate', view: 'issue', project: 'a/b', iid: '7' })
    await vi.runAllTimersAsync()
    expect(router.currentRoute.value.name).toBe('issue')
    expect(router.currentRoute.value.params.iid).toBe('7')
  })
  it('ignores unknown commands and unknown views', async () => {
    dispatch({ cmd: 'self-destruct' })
    dispatch({ cmd: 'navigate', view: 'settings' })
    dispatch(undefined)
    await vi.runAllTimersAsync()
    expect(router.currentRoute.value.name).toBe('home')
  })
})
