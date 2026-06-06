import { onUnmounted, ref, type Ref } from 'vue'
import { onKeyStroke } from '@vueuse/core'

// The new-issue composer + the brief flash on a freshly created issue, plus the
// keyboard surface that owns them: `C` opens the composer, `Esc` leaves select
// mode — both gated so they never fire while typing or when another surface
// (composer/drawer) already owns the key.
export function useIssueComposer(opts: {
  openIid: Ref<string | null>
  selection: { mode: Ref<boolean>; exit: () => void }
}) {
  const composerOpen = ref(false)
  const highlightIid = ref<string | null>(null)
  let highlightTimer: ReturnType<typeof setTimeout> | undefined

  function onCreated(iid: string) {
    highlightIid.value = iid
    clearTimeout(highlightTimer)
    // Matches the 1.6s flash-in animation; clear so re-renders don't replay it.
    highlightTimer = setTimeout(() => (highlightIid.value = null), 1600)
  }

  onUnmounted(() => {
    clearTimeout(highlightTimer)
  })

  // `C` opens the composer — but never while typing or with another surface open.
  // Accept both cases so Caps Lock / Shift don't swallow the shortcut.
  onKeyStroke(['c', 'C'], (e) => {
    const t = e.target as HTMLElement | null
    if (t && (/^(INPUT|TEXTAREA)$/.test(t.tagName) || t.isContentEditable)) return
    if (composerOpen.value || opts.openIid.value) return
    e.preventDefault()
    composerOpen.value = true
  })

  // Esc leaves select mode (and clears the selection) — but only when nothing else
  // (composer, drawer) owns Escape, and never while typing.
  onKeyStroke('Escape', (e) => {
    if (!opts.selection.mode.value) return
    const t = e.target as HTMLElement | null
    if (t && (/^(INPUT|TEXTAREA)$/.test(t.tagName) || t.isContentEditable)) return
    if (composerOpen.value || opts.openIid.value) return
    e.preventDefault()
    opts.selection.exit()
  })

  return { composerOpen, highlightIid, onCreated }
}
