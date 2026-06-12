import { z } from 'zod'
import type { McpTool } from '../types'
import { text, errorResult } from '../types'
import { getSnapshot, getHostActions, buildCommandJs, type HostActions } from './bridge'
import type { McpAppCommand } from '@/shared/lib/rpcContract'
import { normalizeNotification, NOTIFICATION_LIMITS } from '../../notifications'

const iid = z.string().regex(/^\d+$/, 'iid must be numeric')

const VIEWS = [
  'dashboard',
  'projects',
  'issues',
  'issue',
  'merge-requests',
  'merge-request',
  'pipelines',
] as const
const PROJECT_VIEWS = new Set(['issues', 'issue', 'merge-requests', 'merge-request', 'pipelines'])
const IID_VIEWS = new Set(['issue', 'merge-request'])

/** Host actions, or null → callers return a uniform error. Set at boot by src/bun/index.ts. */
function host(): HostActions | null {
  return getHostActions()
}
const NO_BRIDGE = errorResult('App-control bridge not initialized (app still booting?).')

export const appTools: McpTool[] = [
  {
    name: 'lumen_app_state',
    description:
      "What's on screen now: the main window's route/view/project, selected and visible issue iids, plus every open native window. Snapshot is null until the app reports once.",
    inputSchema: {},
    handler: async () => {
      const h = host()
      if (!h) return NO_BRIDGE
      return text({ snapshot: getSnapshot(), windows: h.listWindows() })
    },
  },
  {
    name: 'lumen_app_navigate',
    description:
      "Navigate the main window. view: dashboard | projects | issues | issue | merge-requests | merge-request | pipelines. project (path, e.g. 'group/repo') is required for project-scoped views; iid for issue/merge-request. Fire-and-forget: confirm via lumen_app_state.",
    inputSchema: {
      view: z.enum(VIEWS),
      project: z.string().optional(),
      iid: iid.optional(),
    },
    handler: async (a) => {
      const h = host()
      if (!h) return NO_BRIDGE
      const view = a.view as (typeof VIEWS)[number]
      if (PROJECT_VIEWS.has(view) && !a.project)
        return errorResult(`view '${view}' requires 'project'`)
      if (IID_VIEWS.has(view) && !a.iid) return errorResult(`view '${view}' requires 'iid'`)
      const cmd: McpAppCommand = { cmd: 'navigate', view }
      if (a.project) cmd.project = a.project as string
      if (a.iid) cmd.iid = a.iid as string
      const res = h.driveMain(buildCommandJs(cmd))
      if (!res.ok) return text({ ok: false, note: 'main window not open' })
      return text({ ok: true, note: 'dispatched; confirm via lumen_app_state' })
    },
  },
  {
    name: 'lumen_app_open_issue',
    description: 'Open a native single-issue window (or focus the existing one for that issue).',
    inputSchema: { project: z.string(), iid },
    handler: async (a) => {
      const h = host()
      if (!h) return NO_BRIDGE
      return text(h.openIssueWindow({ fullPath: a.project as string, iid: a.iid as string }))
    },
  },
  {
    name: 'lumen_app_open_issues_window',
    description: 'Open a native multi-issue pager window over several issues of one project.',
    inputSchema: { project: z.string(), iids: z.array(iid).min(1) },
    handler: async (a) => {
      const h = host()
      if (!h) return NO_BRIDGE
      return text(h.openIssuesWindow({ fullPath: a.project as string, iids: a.iids as string[] }))
    },
  },
  {
    name: 'lumen_app_open_settings',
    description: 'Open (or focus) the native Settings window.',
    inputSchema: {},
    handler: async () => {
      const h = host()
      if (!h) return NO_BRIDGE
      return text(h.openSettingsWindow())
    },
  },
  {
    name: 'lumen_app_notify',
    description: 'Post a native desktop notification.',
    inputSchema: {
      title: z.string().max(NOTIFICATION_LIMITS.title * 2),
      body: z
        .string()
        .max(NOTIFICATION_LIMITS.body * 2)
        .optional(),
      subtitle: z
        .string()
        .max(NOTIFICATION_LIMITS.subtitle * 2)
        .optional(),
      silent: z.boolean().optional(),
    },
    handler: async (a) => {
      const h = host()
      if (!h) return NO_BRIDGE
      const notification = normalizeNotification({
        title: a.title as string,
        body: a.body as string | undefined,
        subtitle: a.subtitle as string | undefined,
        silent: a.silent as boolean | undefined,
      })
      h.notify(notification)
      return text({ ok: true })
    },
  },
]
