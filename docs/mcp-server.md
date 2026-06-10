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

Expected: `401`, then a negotiated `initialize`, the 14-tool list, and your GitLab identity from `lumen_me`.

## Tools

GitLab tools (project paths are full paths like `group/project`):

- `lumen_issues_list`, `lumen_issue_get`, `lumen_issue_create`, `lumen_issue_update`, `lumen_issue_comment`
- `lumen_mrs_list`, `lumen_mr_get`, `lumen_mr_comment`, `lumen_mr_review` (approve/unapprove)
- `lumen_labels_list`, `lumen_milestones_list`
- `lumen_me`, `lumen_members_list`, `lumen_search` (project-scoped)
