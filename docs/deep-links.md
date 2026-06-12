# Deep links (`lumen://`)

Lumen registers the `lumen://` URL scheme on macOS so links open the app and route it to
an issue or a filtered issues list. The scheme matches the MCP resource URIs, so the same
string an agent reads as a resource can also be opened by a human.

## URL shapes (v1: issues)

| URL | Effect |
| --- | --- |
| `lumen://issue/<project>/<iid>` | Focus Lumen; open issue `<iid>` as the sheet over the issues list. If a popout window for that issue is already open, focus it instead. |
| `lumen://issues/<project>?<filters>` | Focus Lumen; show the issues list for `<project>` with filters/grouping applied. Allowed query keys: `state, label, assignee, author, q, sort, group, view, scope` (others are ignored). |
| `lumen://` · anything invalid | Just focus the app. |

`<project>` is a full GitLab path and may contain slashes (`group/sub/repo`).

Merge requests (`lumen://mr/...`) are not handled yet.

## Notes

- macOS only. Electrobun registers the scheme **only when the app runs from `/Applications`** —
  dev builds (`bun run app:dev`) never receive `open-url`.
- Deep links only navigate; they can never mutate data. Unknown or malformed links are inert.

## Manual smoke test

On an installed build (drag `Lumen.app` to `/Applications`, launch once), with a project open:

```bash
open 'lumen://issue/<group>/<repo>/<iid>'    # opens the issue sheet over the list
open 'lumen://issues/<group>/<repo>?state=opened&label=bug'   # filtered list
open 'lumen://'                               # just focuses the app
```

Cold start: quit Lumen, then run an `open 'lumen://issue/...'` — the app launches and lands
on the issue once the main window finishes loading.
