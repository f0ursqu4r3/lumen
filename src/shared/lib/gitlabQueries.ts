/** The cheapest authenticated GitLab query — used as the reachability/health
 *  probe by both the host (src/bun/serverHealth wiring) and the webview connect
 *  flow. A plain string constant with no Vue/rpc imports, so it's safe to import
 *  into the Bun process. */
export const PROBE_QUERY = '{ currentUser { username } }'
