import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { McpTool } from './types'

/** Every tool the server exposes. Phase 2 appends the gitlab tool arrays here. */
export const allTools: McpTool[] = []

/** Register the given tools (default: all) with an SDK server instance. */
export function registerTools(server: McpServer, tools: McpTool[] = allTools): void {
  for (const t of tools) {
    server.registerTool(
      t.name,
      { description: t.description, inputSchema: t.inputSchema },
      t.handler as never,
    )
  }
  // Ensure tools/list + tools/call handlers are always registered, even with an
  // empty tool list, so that the MCP protocol negotiation works correctly.
  if (tools.length === 0) {
    ;(server as unknown as { setToolRequestHandlers: () => void }).setToolRequestHandlers()
  }
}
