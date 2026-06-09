import type { Component } from 'vue'
import type { RouteLocationNormalizedLoaded, Router } from 'vue-router'

export type CommandGroup = 'Actions' | 'Projects' | 'Issues' | 'Views'

// Fixed render/nav order for non-empty groups (matches the design spec).
export const GROUP_ORDER: readonly CommandGroup[] = ['Actions', 'Projects', 'Issues', 'Views']

export type Command = {
  id: string
  group: CommandGroup
  title: string
  subtitle?: string
  icon: Component
  action: () => void
}

// Everything a source needs is passed in, so sources stay pure and testable.
export type PaletteContext = {
  currentProject: string | null
  query: string
  router: Router
  route: RouteLocationNormalizedLoaded
}

// Shape returned by the issue-search query (also re-used by tests).
export type PaletteIssueHit = { iid: string; title: string; state: string }

// Minimal row shape consumed from useProjectBrowser.flatRows.
export type BrowserRow = { name: string; fullPath: string }
