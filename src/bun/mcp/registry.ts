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
  // Phase-1 only: with an empty catalog the SDK never wires the tools/list
  // handler (it does so lazily on the first registerTool). Calling the internal
  // initializer keeps tools/list responding with []. Guarded so a future SDK
  // rename degrades to a no-op rather than crashing. Removed in Task 13 once the
  // catalog is non-empty.
  if (tools.length === 0) {
    const internal = server as unknown as { setToolRequestHandlers?: () => void }
    if (typeof internal.setToolRequestHandlers === 'function') internal.setToolRequestHandlers()
  }
}
