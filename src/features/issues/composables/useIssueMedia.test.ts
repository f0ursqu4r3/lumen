import { describe, it, expect } from 'vitest'
import { buildIssueMedia, commentCaption } from './useIssueMedia'

const s = (c: string) => c.repeat(32)

describe('commentCaption', () => {
  it('strips embeds and collapses whitespace', () => {
    expect(commentCaption(`See this ![x](/uploads/${s('a')}/a.png) here`)).toBe('See this here')
  })

  it('returns undefined when only an embed (or nothing) remains', () => {
    expect(commentCaption(`![x](/uploads/${s('a')}/a.png)`)).toBeUndefined()
    expect(commentCaption('')).toBeUndefined()
    expect(commentCaption(null)).toBeUndefined()
  })
})

describe('buildIssueMedia', () => {
  it('orders description media before comment media and tags the source', () => {
    const items = buildIssueMedia(
      `![d](/uploads/${s('a')}/d.png)`,
      [{ body: `look ![c](/uploads/${s('b')}/c.mp4)` }],
      'g/r',
    )
    expect(items.map((i) => i.source)).toEqual(['description', 'comment'])
    expect(items[1].kind).toBe('video')
    expect(items[1].caption).toBe('look')
  })

  it('captions description media from its title or alt', () => {
    const [item] = buildIssueMedia(`![the alt](/uploads/${s('a')}/d.png)`, [], 'g/r')
    expect(item.caption).toBe('the alt')
  })

  it('returns an empty array when there is no media', () => {
    expect(buildIssueMedia('plain text', [{ body: 'no media' }], 'g/r')).toEqual([])
  })

  it('shares the comment prose as caption across multiple embeds from one comment', () => {
    const items = buildIssueMedia(
      null,
      [{ body: `look ![a](/uploads/${s('a')}/a.png) and ![b](/uploads/${s('b')}/b.png) there` }],
      'g/r',
    )
    expect(items).toHaveLength(2)
    expect(items[0].caption).toBe('look and there')
    expect(items[1].caption).toBe('look and there')
  })
})
