import { describe, it, expect, vi } from 'vitest'
import { z } from 'zod'
import { registerTools, allTools } from './registry'
import type { McpTool } from './types'

it('exposes the full gitlab tool catalog with unique lumen_-prefixed names', () => {
  const names = allTools.map((t) => t.name)
  expect(names).toEqual(
    expect.arrayContaining([
      'lumen_issues_list',
      'lumen_issue_get',
      'lumen_issue_create',
      'lumen_issue_update',
      'lumen_issue_comment',
      'lumen_mrs_list',
      'lumen_mr_get',
      'lumen_mr_comment',
      'lumen_mr_review',
      'lumen_labels_list',
      'lumen_milestones_list',
      'lumen_me',
      'lumen_members_list',
      'lumen_search',
    ]),
  )
  expect(new Set(names).size).toBe(names.length)
  expect(names.every((n) => n.startsWith('lumen_'))).toBe(true)
})

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
