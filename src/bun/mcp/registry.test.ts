import { describe, it, expect, vi } from 'vitest'
import { z } from 'zod'
import { registerTools } from './registry'
import type { McpTool } from './types'

describe('registerTools', () => {
  it('registers each tool with the SDK server', () => {
    const registerTool = vi.fn()
    const server = { registerTool } as never
    const tools: McpTool[] = [
      {
        name: 'lumen_demo',
        description: 'demo',
        inputSchema: { x: z.string() },
        handler: async () => ({ content: [] }),
      },
    ]
    registerTools(server, tools)
    expect(registerTool).toHaveBeenCalledTimes(1)
    expect(registerTool).toHaveBeenCalledWith(
      'lumen_demo',
      { description: 'demo', inputSchema: { x: expect.anything() } },
      expect.any(Function),
    )
  })
})
