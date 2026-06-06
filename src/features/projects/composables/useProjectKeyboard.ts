import { nextTick, onBeforeUnmount, onMounted, ref, type Ref } from 'vue'
import type { BrowserRow } from '@/features/projects/composables/useProjectBrowser'

// The picker's command-palette keyboard surface: ⌘1–9 jump-launch, arrows/j/k to
// move the cursor, Enter to launch, Escape to clear/blur the search, and
// type-to-filter from anywhere. Owns the window keydown listener and the initial
// rail snap on mount.
export function useProjectKeyboard(opts: {
  flatRows: Ref<BrowserRow[]>
  active: Ref<number>
  search: Ref<string>
  move: (delta: number) => void
  launch: (row: BrowserRow, i: number) => void
  springTo: (snap?: boolean) => void
}) {
  const searchInput = ref<{ $el?: HTMLElement } | null>(null)
  const focusSearch = () => searchInput.value?.$el?.focus?.()
  const searchFocused = () =>
    !!searchInput.value?.$el && document.activeElement === searchInput.value.$el

  function onKeydown(e: KeyboardEvent) {
    // ⌘1–9 (or Ctrl): jump straight to a project and launch it, from anywhere.
    if ((e.metaKey || e.ctrlKey) && /^[1-9]$/.test(e.key)) {
      const i = Number(e.key) - 1
      const row = opts.flatRows.value[i]
      if (row) {
        e.preventDefault()
        opts.launch(row, i)
      }
      return
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        opts.move(1)
        return
      case 'ArrowUp':
        e.preventDefault()
        opts.move(-1)
        return
      case 'Enter': {
        const row = opts.flatRows.value[opts.active.value]
        if (row) {
          e.preventDefault()
          opts.launch(row, opts.active.value)
        }
        return
      }
      case 'Escape':
        if (opts.search.value) {
          opts.search.value = ''
        } else {
          searchInput.value?.$el?.blur?.()
        }
        return
    }

    if (searchFocused()) {
      // j/k are nav only when not typing into the field.
      return
    }

    if (e.key === 'j') {
      e.preventDefault()
      opts.move(1)
    } else if (e.key === 'k') {
      e.preventDefault()
      opts.move(-1)
    } else if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
      // Type-to-filter from anywhere: focus the field and let the keypress land.
      // (No single-letter star shortcut — it would shadow type-to-filter.)
      focusSearch()
    }
  }

  onMounted(() => {
    window.addEventListener('keydown', onKeydown)
    nextTick(() => opts.springTo(true))
  })
  onBeforeUnmount(() => {
    window.removeEventListener('keydown', onKeydown)
  })

  return { searchInput }
}
