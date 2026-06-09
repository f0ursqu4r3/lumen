import { describe, it, expect, vi } from 'vitest'
import type { PaletteContext, PaletteIssueHit, BrowserRow } from './types'
import {
  routeCommands,
  issueJumpCommand,
  issueCommands,
  projectCommands,
  savedViewCommands,
  filterByQuery,
} from './sources'

function ctx(over: Partial<PaletteContext> = {}): PaletteContext {
  return {
    currentProject: 'grp/proj',
    query: '',
    router: { push: vi.fn() } as unknown as PaletteContext['router'],
    route: { query: {} } as unknown as PaletteContext['route'],
    ...over,
  }
}

describe('routeCommands', () => {
  it('includes project-scoped commands when a project is open', () => {
    const ids = routeCommands(ctx()).map((c) => c.id)
    expect(ids).toContain('new-issue')
    expect(ids).toContain('project-issues')
    expect(ids).toContain('project-pipelines')
    expect(ids).toContain('projects')
    expect(ids).toContain('settings')
  })

  it('omits project-scoped commands when no project is open', () => {
    const ids = routeCommands(ctx({ currentProject: null })).map((c) => c.id)
    expect(ids).toEqual(['projects', 'settings'])
  })

  it('tags every command as an Actions group command', () => {
    expect(routeCommands(ctx()).every((c) => c.group === 'Actions')).toBe(true)
  })

  it('preserves existing route query when opening the compose panel', () => {
    const c = ctx({ route: { query: { label: 'bug' } } as unknown as PaletteContext['route'] })
    routeCommands(c)
      .find((cmd) => cmd.id === 'new-issue')!
      .action()
    expect(c.router.push).toHaveBeenCalledWith({
      name: 'issues',
      params: { fullPath: 'grp/proj' },
      query: { label: 'bug', compose: '1' },
    })
  })
})

describe('issueJumpCommand', () => {
  it('returns a jump command for a bare or #-prefixed number', () => {
    expect(issueJumpCommand(ctx({ query: '42' }))?.id).toBe('issue-jump-42')
    expect(issueJumpCommand(ctx({ query: '#42' }))?.id).toBe('issue-jump-42')
  })

  it('returns null for non-numeric queries or no project', () => {
    expect(issueJumpCommand(ctx({ query: 'login bug' }))).toBeNull()
    expect(issueJumpCommand(ctx({ query: '42', currentProject: null }))).toBeNull()
  })

  it('pushes the issue route on action', () => {
    const c = ctx({ query: '7' })
    issueJumpCommand(c)!.action()
    expect(c.router.push).toHaveBeenCalledWith({
      name: 'issue',
      params: { fullPath: 'grp/proj', iid: '7' },
    })
  })
})

describe('issueCommands', () => {
  const hits: PaletteIssueHit[] = [{ iid: '3', title: 'Fix login', state: 'opened' }]

  it('maps hits to Issues commands with #iid · state subtitle', () => {
    const [cmd] = issueCommands(hits, ctx())
    expect(cmd.group).toBe('Issues')
    expect(cmd.title).toBe('Fix login')
    expect(cmd.subtitle).toBe('#3 · opened')
  })

  it('returns nothing when no project is open', () => {
    expect(issueCommands(hits, ctx({ currentProject: null }))).toEqual([])
  })
})

describe('projectCommands', () => {
  const rows: BrowserRow[] = Array.from({ length: 30 }, (_, i) => ({
    name: `P${i}`,
    fullPath: `grp/p${i}`,
  }))

  it('maps rows to Projects commands and caps the count at 25', () => {
    const cmds = projectCommands(rows, ctx())
    expect(cmds).toHaveLength(25)
    expect(cmds[0]).toMatchObject({ group: 'Projects', title: 'P0', subtitle: 'grp/p0' })
  })
})

describe('savedViewCommands', () => {
  const views = [{ id: 'v1', name: 'My bugs', query: { label: 'bug' } }]

  it('maps views to Views commands', () => {
    const [cmd] = savedViewCommands(views, ctx())
    expect(cmd).toMatchObject({ id: 'view-v1', group: 'Views', title: 'My bugs' })
  })

  it('applies the slice as route query on action', () => {
    const c = ctx()
    savedViewCommands(views, c)[0].action()
    expect(c.router.push).toHaveBeenCalledWith({
      name: 'issues',
      params: { fullPath: 'grp/proj' },
      query: { label: 'bug' },
    })
  })

  it('returns nothing when no project is open', () => {
    expect(savedViewCommands(views, ctx({ currentProject: null }))).toEqual([])
  })
})

describe('filterByQuery', () => {
  const cmds = routeCommands(ctx())

  it('returns all commands for an empty query', () => {
    expect(filterByQuery(cmds, '')).toHaveLength(cmds.length)
  })

  it('matches on title or subtitle, case-insensitively', () => {
    const ids = filterByQuery(cmds, 'settings').map((c) => c.id)
    expect(ids).toEqual(['settings'])
  })

  it('matches on the subtitle text, not just the title', () => {
    const ids = filterByQuery(cmds, 'Connection and local').map((c) => c.id)
    expect(ids).toEqual(['settings'])
  })
})
