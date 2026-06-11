export interface ConnectInput {
  host: string
  port: number
  token: string
}

export interface ConnectSnippets {
  claude: { cli: string; json: string }
  codex: { toml: string }
  raw: { url: string; header: string }
}

/** Pure: build the per-agent connection snippets for lumen's MCP server. */
export function buildConnect({ host, port, token }: ConnectInput): ConnectSnippets {
  const url = `http://${host}:${port}`
  const auth = `Bearer ${token}`
  const header = `Authorization: ${auth}`

  const claudeCli =
    `claude mcp add --scope user --transport http lumen ${url} ` + `--header "${header}"`

  const claudeJson = JSON.stringify(
    {
      mcpServers: {
        lumen: { type: 'http', url, headers: { Authorization: auth } },
      },
    },
    null,
    2,
  )

  const codexToml = [
    'experimental_use_rmcp_client = true',
    '',
    '[mcp_servers.lumen]',
    `url = "${url}"`,
    `bearer_token = "${token}"`,
    'startup_timeout_sec = 10',
    'tool_timeout_sec = 60',
    '',
  ].join('\n')

  return {
    claude: { cli: claudeCli, json: claudeJson },
    codex: { toml: codexToml },
    raw: { url, header },
  }
}
