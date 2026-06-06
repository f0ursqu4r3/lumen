// True when the Lumen window is the foreground, visible window. Pipeline alerts
// always raise an in-app toast; the OS notification fires *only when this is
// false* — i.e. don't double-ping someone who's already looking at the app.
// Read fresh at alert time (no listeners needed): document.hasFocus() goes false
// when another OS window is active, visibilityState goes hidden when minimized.
export function isAppActive(): boolean {
  if (typeof document === 'undefined') return true
  if (document.visibilityState === 'hidden') return false
  return document.hasFocus()
}
