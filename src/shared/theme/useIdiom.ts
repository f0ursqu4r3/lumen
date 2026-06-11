import { computed } from 'vue'
import { useTheme } from './useTheme'
import { themeById } from './themes'

/** Reactive rendering idiom of the active theme — 'terminal' under Phosphor.
 *  Components branch on this for dialect swaps CSS can't express (bracketed
 *  statuses, ▲ priority glyphs, de-colored chips). */
export function useIdiom() {
  const { themeId } = useTheme()
  return computed(() => themeById(themeId.value)?.idiom ?? null)
}
