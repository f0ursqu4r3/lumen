# Issue Drawer — Design

**Date:** 2026-06-01
**Status:** Approved

## Summary

Clicking an issue in the list currently navigates to the full-page `IssueDetail`
route. Instead, a click opens a right-side **drawer** showing the issue, with an
**Expand** button that routes to the existing full page. The drawer is
route-driven via a query param so the back button, refresh, and shareable links
all work, and the list (filters/scroll) stays mounted behind it.

## Decisions

- **Expand target:** navigate to the existing full-page `issue` route. The
  full-page view is unchanged.
- **URL behavior:** route-driven via a `?issue=<iid>` query param on the `issues`
  route (Approach A below).
- **Drawer content:** reuse `IssueDetail.vue` as-is in the drawer body — same
  notes, comment box, close/reopen.
- **Placement:** right-anchored sheet, ~480px, collapsing to full-width under a
  ~480px viewport.

## Approach A — query param on the list route (chosen)

Rejected alternatives: nested child route (more router restructuring, awkward
coexistence with the standalone full-page route); local state only (not
shareable, back button wouldn't close it).

Click sets `?issue=42` on the current `issues` route. `IssueList` stays mounted,
watches the query, and opens the drawer when `issue` is present.

## Flow

- `IssueCard` / `IssueRow` links change from `:to="{ name: 'issue', params }"` to
  `:to="{ query: { ...route.query, issue: iid } }"`. Still a real `<a href>` —
  middle-click and open-in-new-tab still work.
- `IssueList` reads `route.query.issue`. Present → drawer open. Absent → closed.
- **Close** → `router.replace({ query: { …rest, issue: undefined } })`. `replace`
  so closing doesn't pollute history.
- **Expand** → `router.push({ name: 'issue', params: { fullPath, iid } })` → the
  existing full page.

## Components / files

- **Add** shadcn-vue `Sheet` primitive → `src/components/ui/sheet/`. Built on
  reka-ui Dialog: focus trap, ESC-to-close, aria wiring, slide animation. Matches
  the refined-dark / amber aesthetic (see `.impeccable.md`).
- **New** `src/components/IssueDrawer.vue`
  - Props: `fullPath: string`, `iid: string`, `open: boolean`.
  - Emits `update:open` (or `close`) so the parent strips the query param.
  - Chrome: header with `#{{ iid }}` title, an **Expand** button (↗) and the
    sheet's close control.
  - Body: `<IssueDetail :full-path="fullPath" :iid="iid" />`, reused unchanged.
- **Edit** `src/views/IssueList.vue` — render `<IssueDrawer>`, derive `open`/`iid`
  from `route.query.issue`, wire close/expand to the router.
- **Edit** `src/components/IssueCard.vue` + `src/components/IssueRow.vue` —
  repoint the `RouterLink` `:to` to the query form.

## Reuse note

`IssueDetail.vue` is a route view but is already a self-contained
`props → useIssue` unit, so it drops into the drawer body with no change. Its own
`<h1>` title is slightly redundant with the drawer header; keep both (header =
`#iid`, article = title) rather than fork the component.

## Accessibility

- `SheetTitle` is set to `#{{ iid }}` synchronously — reka-ui requires a dialog
  title before the async issue data loads.
- Invalid `iid` falls through to `IssueDetail`'s existing "Issue not found."
- Drawer collapses to full-width under a ~480px viewport.

## Testing

- Drawer opens when `?issue` is set; closed when absent.
- Expand navigates to the `issue` route with the right params.
- Close strips the param via `router.replace` (no history entry).
- `IssueCard` / `IssueRow` render the correct `href` after the repoint.
