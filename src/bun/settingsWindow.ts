// The hash route the native settings window navigates to. Like the issue
// popouts, the route is applied client-side at boot (handed over via
// rpc.getInitialRoute), not baked into the window URL. ?window=1 marks it a
// focused native window so the main shell chrome is hidden (see src/App.vue).
export function settingsWindowRoute(): string {
  return '/settings?window=1'
}
