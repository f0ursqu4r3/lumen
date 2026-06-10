import type { ZodRawShape } from 'zod'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'

export type { CallToolResult }

/** A single MCP tool: a name, a description, a Zod raw-shape input schema, and a handler. */
export interface McpTool {
  name: string
  description: string
  inputSchema: ZodRawShape
  handler: (args: Record<string, unknown>) => Promise<CallToolResult>
}

/** Wrap a value as a tool result. Strings pass through; everything else is pretty JSON. */
export function text(value: unknown): CallToolResult {
  const body = typeof value === 'string' ? value : JSON.stringify(value, null, 2)
  return { content: [{ type: 'text', text: body }] }
}

/** A tool error result (the SDK also catches thrown errors, but this lets us shape the message). */
export function errorResult(message: string): CallToolResult {
  return { content: [{ type: 'text', text: message }], isError: true }
}
