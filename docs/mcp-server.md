# MCP Server (interim enable)

The in-app MCP server is off by default. Until the Settings UI lands, enable it
by editing the app config file:

- macOS: `~/Library/Application Support/Lumen/config.json`
- Linux: `~/.config/Lumen/config.json`
- Windows: `%APPDATA%\Lumen\config.json`

Add an `mcp` block (generate a token yourself — any high-entropy string, e.g.
`openssl rand -base64 24`):

    {
      "gitlabUrl": "https://gitlab.example.com",
      "token": "glpat-...",
      "mcp": { "enabled": true, "port": 7437, "token": "<your-bearer-token>" }
    }

Restart Lumen. The server listens on `http://127.0.0.1:7437` and requires
`Authorization: Bearer <your-bearer-token>` on every request.

Point an MCP client at it (streamable HTTP):

    {
      "mcpServers": {
        "lumen": {
          "url": "http://127.0.0.1:7437/",
          "headers": { "Authorization": "Bearer <your-bearer-token>" }
        }
      }
    }

## Connecting agents

Settings ▸ Agent access shows ready-to-paste config for **Claude Code** and
**Codex CLI**, with your live port and token filled in. Use the **Copy** buttons,
or **Connect** to write the config automatically:

- **Claude Code** — runs `claude mcp add --scope user` when the `claude` CLI is on
  your PATH, otherwise merges `~/.claude.json`.
- **Codex** — merges `~/.codex/config.toml` (a `.bak` is written first) and enables
  `experimental_use_rmcp_client` so Codex can speak streamable HTTP.

Connections work only while Lumen is running with agent access enabled. After
regenerating the token, re-run **Connect** to update already-configured agents.

## Smoke test (real app, real GitLab — requires VPN)

With the app running and the config above set:

    TOKEN='<your-bearer-token>'
    H=(-H "content-type: application/json" -H "accept: application/json, text/event-stream" -H "mcp-protocol-version: 2025-06-18" -H "authorization: Bearer $TOKEN")
    # expect 401 without the header:
    curl -s -o /dev/null -w "%{http_code}\n" -X POST http://127.0.0.1:7437/ -d '{}'
    # initialize, then list tools, then call lumen_me:
    curl -s "${H[@]}" -X POST http://127.0.0.1:7437/ -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"curl","version":"1"}}}'
    curl -s "${H[@]}" -X POST http://127.0.0.1:7437/ -d '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}'
    curl -s "${H[@]}" -X POST http://127.0.0.1:7437/ -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"lumen_me","arguments":{}}}'

Expected: `401`, then a negotiated `initialize`, the 23-tool list, and your GitLab identity from `lumen_me`.

## Tools

### GitLab tools

Project paths are full paths like `group/project` (23 tools total; 17 GitLab + 6 app-control).

- `lumen_issues_list`, `lumen_issue_get`, `lumen_issue_create`, `lumen_issue_update`, `lumen_issue_set_status`, `lumen_issue_comment`, `lumen_issue_comment_edit`
- `lumen_mrs_list`, `lumen_mr_get`, `lumen_mr_comment`, `lumen_mr_comment_edit`, `lumen_mr_review` (approve/unapprove)
- `lumen_labels_list`, `lumen_milestones_list`
- `lumen_me`, `lumen_members_list`, `lumen_search` (project-scoped)

### App-control tools

These tools read and drive the live Lumen desktop app. All `iid` values are
**numeric strings** (e.g. `"42"`). Internal routes (`connect`, `settings`) are
not reachable via `lumen_app_navigate`. Drive commands are best-effort
no-ops when the main window is closed; in that case the result carries the note
`"main window not open"`.

| Tool | Arguments | Description |
|------|-----------|-------------|
| `lumen_app_state` | _(none)_ | Returns the main window's cached snapshot (`route`, `view`, `projectPath`, `selectedIssueIids`, `visibleIssueIids`) plus a list of all open native windows (`{kind: main\|issue\|issues-window\|settings, key}`). Snapshot is `null` until the app first reports. |
| `lumen_app_navigate` | `view` (dashboard\|projects\|issues\|issue\|merge-requests\|merge-request\|pipelines); `project` (required for project-scoped views); `iid` (required for issue/merge-request) | Drives the **main window** to the given route. Fire-and-forget — re-read `lumen_app_state` to confirm the navigation landed. |
| `lumen_app_open_issue` | `project`, `iid` | Opens (or focuses) a native single-issue window for the given issue. |
| `lumen_app_open_issues_window` | `project`, `iids` (array, min 1) | Opens a multi-issue pager window for the given set of issues. |
| `lumen_app_open_settings` | _(none)_ | Opens (or focuses) the Settings window. |
| `lumen_app_notify` | `title`; `body`? ; `subtitle`? ; `silent`? | Sends a native desktop notification. |

#### Architecture notes

The webview pushes debounced state snapshots to the Bun host via the
`reportAppState` RPC (main window only; enforced host-side). Drive commands
travel in the opposite direction: the host dispatches a `lumen:mcp-command`
`CustomEvent` into the webview, which the app's command handler picks up and
routes to the appropriate action.
