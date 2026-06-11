import { ref, onScopeDispose, getCurrentScope } from 'vue'
import type { ThemeState } from '@/shared/lib/rpcContract'
import type { ThemeOverrides } from './overrides'
import { rpc } from '@/shared/lib/rpc'
import { applyTheme, readStored, writeStored } from './applyTheme'

/**
 * Theme controller. Reads the durable localStorage state on construction, and on
 * every mutation: updates reactive refs, applies to the DOM, writes localStorage,
 * and asks the host to broadcast the change to the other windows.
 */
export function useTheme() {
  const seed = readStored(localStorage)
  const themeId = ref(seed.themeId)
  const overrides = ref<ThemeOverrides>(seed.overrides)

  // Keep our reactive refs in sync when another window broadcasts a change.
  // Refs ONLY — installThemeSync handles DOM + localStorage, and the originator
  // already broadcast; re-applying/re-broadcasting here would loop.
  const onBroadcast = (e: Event) => {
    const state = (e as CustomEvent).detail as ThemeState | undefined
    if (!state?.themeId) return
    themeId.value = state.themeId
    overrides.value = state.overrides
  }
  window.addEventListener('lumen:theme-changed', onBroadcast)
  // Clean up when used inside a component scope (no-op for bare test calls).
  if (getCurrentScope())
    onScopeDispose(() => window.removeEventListener('lumen:theme-changed', onBroadcast))

  async function commit(): Promise<void> {
    const state: ThemeState = { themeId: themeId.value, overrides: overrides.value }
    applyTheme(document, state)
    writeStored(localStorage, state)
    await rpc.broadcastTheme(state)
  }

  async function setTheme(id: string): Promise<void> {
    themeId.value = id
    await commit()
  }

  async function setOverride(partial: ThemeOverrides): Promise<void> {
    overrides.value = { ...overrides.value, ...partial }
    await commit()
  }

  async function reset(): Promise<void> {
    overrides.value = {}
    await commit()
  }

  return { themeId, overrides, setTheme, setOverride, reset }
}
