// The hash routes a native popout navigates to. These are NOT baked into the
// window's initial URL: the views:// scheme used by the bundled app fails to
// load an initial URL whose route rides in the fragment (#…) — the window comes
// up blank. So every popout loads the bare app base and the route is applied
// client-side at boot (the host hands it over via rpc.getInitialRoute; see
// src/bun/index.ts and src/main.ts). `fullPath` may contain slashes — the
// :fullPath(.*) route matches them inside the hash, so it is interpolated
// verbatim. ?window=1 tells the view it is a focused native window (no
// back-to-list arrow).
export function issueWindowRoute(fullPath: string, iid: string): string {
  return `/projects/${fullPath}/issues/${iid}?window=1`
}

// Combined multi-issue window route. The iids ride as a comma-joined query
// (order preserved = pager order); ?window=1 marks it a native window.
export function issuesWindowRoute(fullPath: string, iids: string[]): string {
  return `/projects/${fullPath}/issues-window?iids=${iids.join(',')}&window=1`
}
