import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { loadConfig, saveMcpConfig } from '../config'
import { isAuthorized } from './auth'
import { registerTools } from './registry'

const SERVER_NAME = 'lumen'
const SERVER_VERSION = '0.1.0'
export const DEFAULT_MCP_PORT = 7437

// Bun's serve return type isn't available under Vitest (node); keep it loose.
let httpServer: { stop: (closeActive?: boolean) => void } | null = null

function buildServer(): McpServer {
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION })
  registerTools(server)
  return server
}

/**
 * The fetch handler: bearer gate, then a fresh stateless transport + server per
 * request (verified to work under Bun and Vitest, since it uses Web-standard
 * Request/Response). Exported so it can be integration-tested without Bun.serve.
 */
export function createMcpFetch(token: string): (req: Request) => Promise<Response> {
  return async (req) => {
    if (!isAuthorized(req, token)) {
      return new Response('Unauthorized', { status: 401 })
    }
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    })
    const server = buildServer()
    await server.connect(transport)
    return transport.handleRequest(req)
  }
}

export function isRunning(): boolean {
  return httpServer !== null
}

/** Start the listener. Idempotent. Returns a port-in-use (or other) error instead of throwing. */
export function startMcp(port: number, token: string): { ok: true } | { ok: false; error: string } {
  if (httpServer) return { ok: true }
  try {
    httpServer = (
      globalThis as { Bun: { serve: (o: unknown) => { stop: (c?: boolean) => void } } }
    ).Bun.serve({
      hostname: '127.0.0.1',
      port,
      fetch: createMcpFetch(token),
    })
    return { ok: true }
  } catch (e) {
    httpServer = null
    return { ok: false, error: e instanceof Error ? e.message : 'failed to start MCP server' }
  }
}

export function stopMcp(): void {
  if (httpServer) {
    httpServer.stop(true)
    httpServer = null
  }
}

/** Boot-time: start the server iff config says enabled and a token exists. */
export function startMcpIfEnabled(): { ok: true } | { ok: false; error: string } | null {
  const { mcp } = loadConfig()
  if (!mcp?.enabled || !mcp.token) return null
  return startMcp(mcp.port ?? DEFAULT_MCP_PORT, mcp.token)
}

/**
 * Toggle the server from the (future) Settings UI: persists enabled/port,
 * generates nothing here (caller supplies the token), and (re)starts or stops.
 */
export function setMcpEnabled(
  enabled: boolean,
  port: number,
  token: string | null,
): { ok: true } | { ok: false; error: string } {
  saveMcpConfig({ enabled, port, token })
  stopMcp()
  if (enabled && token) return startMcp(port, token)
  return { ok: true }
}
