// Build the hash-routed URL a native issue window loads. `base` is whatever
// resolveStartUrl produced (the HMR dev server or the bundled views:// app);
// the issue route lives in the hash (the app uses createWebHashHistory), and
// ?window=1 tells IssueDetail to render as a focused single-issue window with no
// back-to-list arrow. `fullPath` may contain slashes — the :fullPath(.*) route
// matches them inside the hash, so it is interpolated verbatim.
export function issueWindowUrl(base: string, fullPath: string, iid: string): string {
  return `${base}#/projects/${fullPath}/issues/${iid}?window=1`
}

// Build the hash-routed URL a combined multi-issue window loads. Same base rules
// as issueWindowUrl; the iids ride as a comma-joined query (order preserved =
// pager order) and ?window=1 marks it a native window.
export function issuesWindowUrl(base: string, fullPath: string, iids: string[]): string {
  return `${base}#/projects/${fullPath}/issues-window?iids=${iids.join(',')}&window=1`
}
