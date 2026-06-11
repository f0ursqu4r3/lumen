import { describe, it, expect, vi } from 'vitest'
import { z } from 'zod'
import { registerTools, allTools } from './registry'
import type { McpTool } from './types'

it('exposes the full tool catalog with unique lumen_-prefixed names', () => {
  const names = allTools.map((t) => t.name)
  expect(names).toEqual(
    expect.arrayContaining([
      'lumen_issues_list',
      'lumen_issue_get',
      'lumen_issue_create',
      'lumen_issue_update',
      'lumen_issue_set_status',
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
      'lumen_app_state',
      'lumen_app_navigate',
      'lumen_app_open_issue',
      'lumen_app_open_issues_window',
      'lumen_app_open_settings',
      'lumen_app_notify',
    ]),
  )
  expect(new Set(names).size).toBe(names.length)
  expect(names).toHaveLength(21)
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
