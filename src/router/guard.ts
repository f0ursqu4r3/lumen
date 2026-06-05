export function nextRoute(
  toName: string | null | undefined,
  configured: boolean,
): true | { name: string } {
  if (toName === 'connect') return true
  return configured ? true : { name: 'connect' }
}
