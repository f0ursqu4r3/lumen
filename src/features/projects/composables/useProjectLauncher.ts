import { nextTick, ref, type Ref } from 'vue'
import { useRouter } from 'vue-router'
import { useToggleStar } from '@/features/projects/composables/useToggleStar'
import type { BrowserRow } from '@/features/projects/composables/useProjectBrowser'

// Launching a project morphs its name into the issues header via a View
// Transition, so the picker → issues handoff reads as one instrument retuning
// rather than a page swap. Degrades to a plain push where VT is unavailable or
// motion is reduced. Also owns the star toggle (pinning the cursor to the row so
// the rail follows it across sections).
export function useProjectLauncher(opts: { active: Ref<number>; pinTo: Ref<string | null> }) {
  const router = useRouter()
  const toggleStar = useToggleStar()
  const reduce =
    typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null

  const morphingPath = ref<string | null>(null)
  const nameStyle = (row: BrowserRow) =>
    row.fullPath === morphingPath.value ? { viewTransitionName: 'project-title' } : undefined

  function navigate(row: BrowserRow) {
    return router.push({ name: 'issues', params: { fullPath: row.fullPath } })
  }

  async function launch(row: BrowserRow, i: number) {
    opts.active.value = i
    const canMorph = typeof document.startViewTransition === 'function' && !reduce?.matches
    if (!canMorph) {
      navigate(row)
      return
    }
    morphingPath.value = row.fullPath
    await nextTick() // ensure the name carries the transition-name before snapshot
    document.startViewTransition(async () => {
      await navigate(row)
      await nextTick()
    })
  }

  function onRowClick(e: MouseEvent, row: BrowserRow, i: number) {
    // Let the browser handle modified clicks (open in new tab) via the real href.
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
    e.preventDefault()
    launch(row, i)
  }

  // Toggle the star; pin the selection to this project so the rail follows it as
  // it hops into (or out of) the Starred section.
  function onToggleStar(row: BrowserRow) {
    opts.pinTo.value = row.fullPath
    toggleStar.mutate({ fullPath: row.fullPath, name: row.name, starred: row.starred })
  }

  return { morphingPath, nameStyle, launch, onRowClick, onToggleStar }
}
