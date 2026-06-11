import { computed, effectScope, type ComputedRef } from 'vue'
import { useTheme } from './useTheme'
import { themeById } from './themes'

/** Lazily-created module singleton: per-row components (IssueRow/IssueCard/
 *  LabelChip/StateBadge) all call useIdiom(), so a per-call useTheme() would
 *  mean 2 localStorage reads + a window listener per component instance.
 *  Built inside a detached effectScope so the underlying useTheme()'s
 *  onScopeDispose never registers on a caller's component scope — the
 *  singleton (and its theme-broadcast listener) lives for the page. */
let idiom: ComputedRef<'terminal' | null> | undefined

/** Reactive rendering idiom of the active theme — 'terminal' under Phosphor.
 *  Components branch on this for dialect swaps CSS can't express (bracketed
 *  statuses, ▲ priority glyphs, de-colored chips). */
export function useIdiom(): ComputedRef<'terminal' | null> {
  if (!idiom) {
    const scope = effectScope(true)
    idiom = scope.run(() => {
      const { themeId } = useTheme()
      return computed(() => themeById(themeId.value)?.idiom ?? null)
    })!
  }
  return idiom
}
