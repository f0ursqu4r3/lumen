import type { Frame, PopoutSession, SessionState } from './session'

// Routes the main window is allowed to restore into. Mirrors the agent-navigable
// view set in src/shared/composables/useAppStateReport.ts (VIEW_TO_ROUTE values):
// internal routes (connect, settings, issues-window) are deliberately excluded so
// a restored launch never lands on chrome the user can't otherwise reach directly.
const SAFE_VIEWS = new Set([
  'home',
  'projects',
  'issues',
  'issue',
  'merge-requests',
  'merge-request',
  'pipelines',
])

export interface RestorePlan {
  mainFrame: Frame | null
  mainRoute: string | null
  mainView: string | null
  popouts: PopoutSession[]
}

/** Decide what to restore. Off / not-connected ⇒ clean launch (everything null). */
export function planRestore(args: {
  enabled: boolean
  connected: boolean
  session: SessionState
}): RestorePlan {
  if (!args.enabled || !args.connected) {
    return { mainFrame: null, mainRoute: null, mainView: null, popouts: [] }
  }
  const { main, popouts } = args.session
  const safe = main.view != null && SAFE_VIEWS.has(main.view)
  return {
    mainFrame: main.frame,
    mainRoute: safe ? main.route : null,
    mainView: safe ? main.view : null,
    popouts,
  }
}
