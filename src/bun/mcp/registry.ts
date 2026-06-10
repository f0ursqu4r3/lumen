import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { McpTool } from './types'
import { issueTools } from './gitlab/issues'
import { mrTools } from './gitlab/mergeRequests'
import { labelTools } from './gitlab/labelsMilestones'
import { userTools } from './gitlab/usersSearch'

/** Every tool the server exposes. */
export const allTools: McpTool[] = [...issueTools, ...mrTools, ...labelTools, ...userTools]

/** Register the given tools (default: all) with an SDK server instance. */
export function registerTools(server: McpServer, tools: McpTool[] = allTools): void {
  for (const t of tools) {
    server.registerTool(
      t.name,
      { description: t.description, inputSchema: t.inputSchema },
      t.handler as never,
    )
  }
}
