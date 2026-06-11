import { describe, it, expect } from 'vitest'
import { planRestore } from './restore'
import type { SessionState } from './session'

const session = (
  over: Partial<SessionState['main']> = {},
  popouts: SessionState['popouts'] = [],
): SessionState => ({
  main: {
    frame: { x: 1, y: 2, width: 800, height: 600 },
    route: '/issues',
    view: 'issues',
    ...over,
  },
  popouts,
})

describe('planRestore', () => {
  it('returns an empty plan when disabled', () => {
    expect(planRestore({ enabled: false, connected: true, session: session() })).toEqual({
      mainFrame: null,
      mainRoute: null,
      mainView: null,
      popouts: [],
    })
  })

  it('returns an empty plan when not connected', () => {
    expect(planRestore({ enabled: true, connected: false, session: session() })).toEqual({
      mainFrame: null,
      mainRoute: null,
      mainView: null,
      popouts: [],
    })
  })

  it('restores frame, route, and popouts when enabled and connected', () => {
    const popouts: SessionState['popouts'] = [
      {
        id: 'a/b#3',
        kind: 'issue',
        fullPath: 'a/b',
        iid: '3',
        frame: { x: 5, y: 6, width: 720, height: 900 },
      },
    ]
    expect(planRestore({ enabled: true, connected: true, session: session({}, popouts) })).toEqual({
      mainFrame: { x: 1, y: 2, width: 800, height: 600 },
      mainRoute: '/issues',
      mainView: 'issues',
      popouts,
    })
  })

  it('drops an unsafe main route but keeps the frame and popouts', () => {
    const plan = planRestore({
      enabled: true,
      connected: true,
      session: session({ route: '/settings', view: 'settings' }),
    })
    expect(plan.mainRoute).toBeNull()
    expect(plan.mainView).toBeNull()
    expect(plan.mainFrame).toEqual({ x: 1, y: 2, width: 800, height: 600 })
  })

  it('treats a null view as unsafe', () => {
    const plan = planRestore({
      enabled: true,
      connected: true,
      session: session({ route: null, view: null }),
    })
    expect(plan.mainRoute).toBeNull()
  })

  it('allows each safe view', () => {
    for (const view of [
      'home',
      'projects',
      'issues',
      'issue',
      'merge-requests',
      'merge-request',
      'pipelines',
    ]) {
      const plan = planRestore({
        enabled: true,
        connected: true,
        session: session({ route: `/${view}`, view }),
      })
      expect(plan.mainView).toBe(view)
    }
  })
})
