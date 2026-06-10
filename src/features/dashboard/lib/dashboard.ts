export const DASHBOARD_POLL_MS = 30_000

export const dashboardKeys = {
  currentUser: ['dashboard', 'current-user'] as const,
  assignedIssues: (username: string) => ['dashboard', 'assigned-issues', username] as const,
  assignedMrs: ['dashboard', 'assigned-mrs'] as const,
  reviewRequestedMrs: ['dashboard', 'review-requested-mrs'] as const,
}

// GitLab's root `issues` query exposes no project object — only `webPath`, which
// looks like `/group/sub/proj/-/issues/42`. Pull the project full path and iid so
// the dashboard can deep-link into the in-app issue route. Tolerate a full URL
// and a missing leading slash so a valid issue never falls back to a dead
// external link.
export function parseIssuePath(webPath: string): { fullPath: string; iid: string } | null {
  if (!webPath) return null
  let path = webPath
  if (/^https?:\/\//i.test(path)) {
    try {
      path = new URL(path).pathname
    } catch {
      return null
    }
  }
  const m = path.match(/([^?#]+?)\/-\/issues\/(\d+)/)
  if (!m) return null
  return { fullPath: m[1].replace(/^\/+/, ''), iid: m[2] }
}

// `reference(full: true)` returns `group/project#42` — a format-stable source for
// the project path + iid, independent of the webPath URL structure (which varies
// by GitLab version). Preferred over parseIssuePath when available.
export function parseIssueRef(
  reference: string | null | undefined,
): { fullPath: string; iid: string } | null {
  if (!reference) return null
  const m = reference.match(/^(.+)#(\d+)$/)
  if (!m) return null
  return { fullPath: m[1], iid: m[2] }
}

type UserCore = { name?: string | null; username: string }
type LabelNode = { id: string; title: string; color: string }

export type DashboardIssue = {
  iid: string
  title: string
  state: string
  // `group/project#42` — the reliable deep-link source (see parseIssueRef).
  reference?: string | null
  webPath: string
  webUrl: string
  updatedAt: string
  labels?: { nodes?: (LabelNode | null)[] | null } | null
}

export type DashboardMr = {
  iid: string
  title: string
  state: string
  draft: boolean
  webUrl: string
  updatedAt: string
  project: { fullPath: string }
  approved: boolean
  approvalsRequired?: number | null
  reviewers?: { nodes?: (UserCore | null)[] | null } | null
}

// Shared selection set for the two currentUser MR connections, kept in one place
// so the field list can't drift between the assigned and review-requested queries.
export const MR_NODE_FIELDS = `
  iid
  title
  state
  draft
  webUrl
  updatedAt
  project { fullPath }
  approved
  approvalsRequired
  reviewers { nodes { name username } }
`
