import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { loadConfig, saveMcpConfig } from '../config'
import { isAuthorized, generateToken } from './auth'
import { registerTools } from './registry'
import { registerResources } from './resources'
import type { McpStatus } from '@/shared/lib/rpcContract'

const SERVER_NAME = 'lumen'
const SERVER_VERSION = '0.1.0'
export const DEFAULT_MCP_PORT = 7437

// Bun's serve return type isn't available under Vitest (node); keep it loose.
let httpServer: { stop: (closeActive?: boolean) => Promise<void> | void } | null = null

function buildServer(): McpServer {
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION })
  registerTools(server)
  registerResources(server)
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
    // Force-close in-flight requests; this is a desktop app, graceful drain is unnecessary.
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

/** Current MCP state for the Settings pane. Never includes the token itself. */
export function getMcpStatus(): McpStatus {
  const { mcp } = loadConfig()
  return {
    enabled: mcp?.enabled ?? false,
    port: mcp?.port ?? DEFAULT_MCP_PORT,
    running: isRunning(),
    hasToken: Boolean(mcp?.token),
  }
}

/** Return the current bearer token (explicit reveal/copy action), or null. */
export function revealMcpToken(): { token: string | null } {
  return { token: loadConfig().mcp?.token ?? null }
}

/** Rotate the token: persist a new one, restart if running, return it once. */
export function regenerateMcpToken(): { token: string } {
  const { mcp } = loadConfig()
  const port = mcp?.port ?? DEFAULT_MCP_PORT
  const enabled = mcp?.enabled ?? false
  const token = generateToken()
  saveMcpConfig({ enabled, port, token })
  stopMcp()
  if (enabled) startMcp(port, token)
  return { token }
}

/**
 * Toggle the server from Settings: persists enabled/port, generates a token on
 * first enable, and (re)starts or stops. Token is never required from the caller.
 */
export function setMcpEnabled(a: {
  enabled: boolean
  port: number
}): { ok: true } | { ok: false; error: string } {
  const current = loadConfig().mcp
  const token = current?.token ?? (a.enabled ? generateToken() : null)
  saveMcpConfig({ enabled: a.enabled, port: a.port, token })
  stopMcp()
  if (a.enabled && token) return startMcp(a.port, token)
  return { ok: true }
}
