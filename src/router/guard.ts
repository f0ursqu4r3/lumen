export function nextRoute(
  toName: string | null | undefined,
  configured: boolean,
): true | { name: string } {
  if (toName === 'settings') return true
  return configured ? true : { name: 'settings' }
}
