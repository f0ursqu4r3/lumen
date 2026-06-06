// A GitLab REST issue, trimmed to what the picker aggregates. `references.full`
// is `group/project#iid`; `web_url` is the fallback when references is absent.
export interface RestIssue {
  references?: { full?: string | null } | null
  web_url?: string | null
}

export interface AssignedProject {
  name: string
  fullPath: string
  assignedOpen: number
}

// Derive a project's fullPath from an assigned issue: prefer `references.full`
// (`group/project#12`), fall back to the issue web URL (`.../group/project/-/issues/1`).
export function issueFullPath(issue: RestIssue): string | null {
  const ref = issue.references?.full
  if (ref) {
    const hash = ref.indexOf('#')
    const path = hash >= 0 ? ref.slice(0, hash) : ref
    if (path) return path
  }
  const url = issue.web_url
  if (url) {
    const m = url.match(/^https?:\/\/[^/]+\/(.+?)\/-\/issues\b/)
    if (m) return m[1]
  }
  return null
}

// Collapse assigned issues to distinct projects with an open count, ordered by
// most-assigned first then name — the busiest triage targets float to the top.
export function aggregateAssigned(issues: RestIssue[]): AssignedProject[] {
  const byPath = new Map<string, number>()
  for (const issue of issues) {
    const fullPath = issueFullPath(issue)
    if (!fullPath) continue
    byPath.set(fullPath, (byPath.get(fullPath) ?? 0) + 1)
  }
  return [...byPath.entries()]
    .map(([fullPath, assignedOpen]) => ({
      fullPath,
      name: fullPath.split('/').at(-1) ?? fullPath,
      assignedOpen,
    }))
    .sort((a, b) => b.assignedOpen - a.assignedOpen || a.name.localeCompare(b.name))
}
