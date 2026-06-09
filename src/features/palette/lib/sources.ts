import { Bookmark, FileText, FolderGit2, GitBranch, Hash, Plus, Settings } from '@lucide/vue'
import { openSettings } from '@/shared/composables/useSettings'
import type { SavedView } from '@/shared/composables/useSavedViews'
import type { BrowserRow, Command, PaletteContext, PaletteIssueHit } from './types'

const PROJECT_RENDER_CAP = 25

/** Route/action commands. Project-scoped ones appear only with an open project. */
export function routeCommands(ctx: PaletteContext): Command[] {
  const { currentProject, router, route } = ctx
  const commands: Command[] = []

  if (currentProject) {
    commands.push(
      {
        id: 'new-issue',
        group: 'Actions',
        title: 'Create Issue',
        subtitle: currentProject,
        icon: Plus,
        action: () =>
          router.push({
            name: 'issues',
            params: { fullPath: currentProject },
            query: { ...route.query, compose: '1' },
          }),
      },
      {
        id: 'project-issues',
        group: 'Actions',
        title: 'Open Issues',
        subtitle: currentProject,
        icon: FileText,
        action: () => router.push({ name: 'issues', params: { fullPath: currentProject } }),
      },
      {
        id: 'project-pipelines',
        group: 'Actions',
        title: 'Open Pipelines',
        subtitle: currentProject,
        icon: GitBranch,
        action: () => router.push({ name: 'pipelines', params: { fullPath: currentProject } }),
      },
    )
  }

  commands.push(
    {
      id: 'projects',
      group: 'Actions',
      title: 'Open Projects',
      subtitle: 'Go to the project launcher',
      icon: FolderGit2,
      action: () => router.push({ name: 'projects' }),
    },
    {
      id: 'settings',
      group: 'Actions',
      title: 'Open Settings',
      subtitle: 'Connection and local preferences',
      icon: Settings,
      action: openSettings,
    },
  )

  return commands
}

/** Direct `#123` / `123` jump within the current project. */
export function issueJumpCommand(ctx: PaletteContext): Command | null {
  const { currentProject, query, router } = ctx
  if (!currentProject) return null
  const iid = query.trim().match(/^#?(\d+)$/)?.[1]
  if (!iid) return null
  return {
    id: `issue-jump-${iid}`,
    group: 'Issues',
    title: `Open Issue #${iid}`,
    subtitle: currentProject,
    icon: Hash,
    action: () => router.push({ name: 'issue', params: { fullPath: currentProject, iid } }),
  }
}

/** Title-search hits → Issues commands. */
export function issueCommands(hits: PaletteIssueHit[], ctx: PaletteContext): Command[] {
  const { currentProject, router } = ctx
  if (!currentProject) return []
  return hits.map((h) => ({
    id: `issue-${h.iid}`,
    group: 'Issues',
    title: h.title,
    subtitle: `#${h.iid} · ${h.state}`,
    icon: Hash,
    action: () => router.push({ name: 'issue', params: { fullPath: currentProject, iid: h.iid } }),
  }))
}

/** Project rows (already query-filtered by useProjectBrowser) → Projects commands. */
export function projectCommands(rows: BrowserRow[], ctx: PaletteContext): Command[] {
  const { router } = ctx
  return rows.slice(0, PROJECT_RENDER_CAP).map((p) => ({
    id: `project-${p.fullPath}`,
    group: 'Projects',
    title: p.name,
    subtitle: p.fullPath,
    icon: FolderGit2,
    action: () => router.push({ name: 'issues', params: { fullPath: p.fullPath } }),
  }))
}

/** Current-project saved views → Views commands; selecting applies the slice. */
export function savedViewCommands(views: SavedView[], ctx: PaletteContext): Command[] {
  const { currentProject, router } = ctx
  if (!currentProject) return []
  return views.map((v) => ({
    id: `view-${v.id}`,
    group: 'Views',
    title: v.name,
    subtitle: 'Saved view',
    icon: Bookmark,
    action: () =>
      router.push({ name: 'issues', params: { fullPath: currentProject }, query: v.query }),
  }))
}

/** Substring filter on title/subtitle; empty query passes everything through. */
export function filterByQuery(commands: Command[], query: string): Command[] {
  const q = query.trim().toLowerCase()
  if (!q) return commands
  return commands.filter(
    (c) => c.title.toLowerCase().includes(q) || (c.subtitle?.toLowerCase().includes(q) ?? false),
  )
}
