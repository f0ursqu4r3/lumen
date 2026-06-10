import { describe, it, expect, vi, beforeEach } from 'vitest'

const c = vi.hoisted(() => ({ gql: vi.fn() }))
vi.mock('./client', () => c)

import { labelTools } from './labelsMilestones'
const tool = (name: string) => labelTools.find((t) => t.name === name)!

beforeEach(() => c.gql.mockReset())

describe('lumen_labels_list', () => {
  it('includes ancestor groups and returns title/color/description', async () => {
    c.gql.mockResolvedValue({
      project: { labels: { nodes: [{ title: 'bug', color: '#f00', description: null }] } },
    })
    const res = await tool('lumen_labels_list').handler({ project: 'g/p' })
    expect(c.gql).toHaveBeenCalledWith(
      expect.stringContaining('includeAncestorGroups:true'),
      expect.objectContaining({ p: 'g/p' }),
    )
    expect(res.content[0].text).toContain('"title": "bug"')
  })
})

describe('lumen_milestones_list', () => {
  it('filters by state and returns title/state/dueDate', async () => {
    c.gql.mockResolvedValue({
      project: {
        milestones: { nodes: [{ title: 'v1', state: 'active', dueDate: null, webPath: '/p' }] },
      },
    })
    const res = await tool('lumen_milestones_list').handler({ project: 'g/p', state: 'active' })
    expect(c.gql).toHaveBeenCalledWith(
      expect.stringContaining('milestones('),
      expect.objectContaining({ p: 'g/p', state: 'active' }),
    )
    expect(res.content[0].text).toContain('"title": "v1"')
  })
})
