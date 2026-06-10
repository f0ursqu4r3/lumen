export function nextRoute(
  toName: string | null | undefined,
  configured: boolean,
): true | { name: string } {
  // 'connect' and 'settings' are always reachable — settings hosts the
  // Connection pane, so it must open even when not yet configured.
  if (toName === 'connect' || toName === 'settings') return true
  return configured ? true : { name: 'connect' }
}
