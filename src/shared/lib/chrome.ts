import type { RouteLocationNormalizedLoaded } from 'vue-router'

type ChromeRoute = Pick<RouteLocationNormalizedLoaded, 'meta' | 'query'>

/**
 * The persistent app shell renders only for routes that opt in via
 * `meta.shell`, and never for a view popped into its own native window
 * (`?window=1`). Everything else (Connect, multi-issue window, un-migrated
 * views) renders bare.
 */
export function shouldShowChrome(route: ChromeRoute): boolean {
  return route.meta.shell === true && route.query.window !== '1'
}
