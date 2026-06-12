import { describe, it, expect } from 'vitest'
import { parseLumenUrl, intentToLocation } from './deepLink'

describe('parseLumenUrl', () => {
  it('parses an issue link with a single-segment project', () => {
    expect(parseLumenUrl('lumen://issue/group/42')).toEqual({
      kind: 'issue',
      project: 'group',
      iid: '42',
    })
  })

  it('parses an issue link with a multi-segment project', () => {
    expect(parseLumenUrl('lumen://issue/group/sub/repo/42')).toEqual({
      kind: 'issue',
      project: 'group/sub/repo',
      iid: '42',
    })
  })

  it('focuses (not errors) when the iid is not numeric', () => {
    expect(parseLumenUrl('lumen://issue/group/repo/not-a-number')).toEqual({ kind: 'focus' })
  })

  it('focuses when an issue link has no project', () => {
    expect(parseLumenUrl('lumen://issue/42')).toEqual({ kind: 'focus' })
  })

  it('parses an issues list link, whitelisting filter keys and dropping unknowns', () => {
    expect(parseLumenUrl('lumen://issues/group/repo?state=opened&group=milestone&evil=1')).toEqual({
      kind: 'issues',
      project: 'group/repo',
      query: { state: 'opened', group: 'milestone' },
    })
  })

  it('keeps repeated filter values as an array', () => {
    expect(parseLumenUrl('lumen://issues/group/repo?label=bug&label=ui')).toEqual({
      kind: 'issues',
      project: 'group/repo',
      query: { label: ['bug', 'ui'] },
    })
  })

  it('drops over-long filter values and caps array length', () => {
    const long = 'x'.repeat(201)
    const many = Array.from({ length: 25 }, (_, i) => `label=l${i}`).join('&')
    const out = parseLumenUrl(`lumen://issues/group/repo?q=${long}&${many}`)
    expect(out).toEqual({
      kind: 'issues',
      project: 'group/repo',
      query: { label: Array.from({ length: 20 }, (_, i) => `l${i}`) },
    })
  })

  it('focuses when an issues link has no project', () => {
    expect(parseLumenUrl('lumen://issues')).toEqual({ kind: 'focus' })
  })

  it('focuses for bare lumen://, app/current, and unknown kinds', () => {
    expect(parseLumenUrl('lumen://')).toEqual({ kind: 'focus' })
    expect(parseLumenUrl('lumen://app/current')).toEqual({ kind: 'focus' })
    expect(parseLumenUrl('lumen://mr/group/repo/7')).toEqual({ kind: 'focus' })
  })

  it('focuses for a non-lumen scheme or garbage input', () => {
    expect(parseLumenUrl('https://example.com/issue/1')).toEqual({ kind: 'focus' })
    expect(parseLumenUrl('not a url')).toEqual({ kind: 'focus' })
  })

  it('cannot escape via .. — the URL parser normalizes it to a benign path', () => {
    // new URL collapses ../ before we validate, so traversal resolves to a plain link.
    expect(parseLumenUrl('lumen://issue/../../x/1')).toEqual({
      kind: 'issue',
      project: 'x',
      iid: '1',
    })
  })

  it('lowercases the kind so an uppercase host still routes', () => {
    expect(parseLumenUrl('lumen://ISSUE/group/repo/42')).toEqual({
      kind: 'issue',
      project: 'group/repo',
      iid: '42',
    })
  })

  it('focuses for a project segment that starts with a dot', () => {
    expect(parseLumenUrl('lumen://issue/.hidden/repo/42')).toEqual({ kind: 'focus' })
  })

  it('ignores a port in the authority (parses as the same issue link)', () => {
    // The URL parser drops the port from hostname; the kind is still "issue".
    expect(parseLumenUrl('lumen://issue:8080/group/repo/42')).toEqual({
      kind: 'issue',
      project: 'group/repo',
      iid: '42',
    })
  })
})

describe('intentToLocation', () => {
  it('maps an issue intent to the list route with the drawer query', () => {
    expect(intentToLocation({ kind: 'issue', project: 'group/repo', iid: '42' })).toEqual({
      name: 'issues',
      params: { fullPath: 'group/repo' },
      query: { issue: '42' },
    })
  })

  it('maps an issues intent to the list route, passing filters through', () => {
    expect(
      intentToLocation({ kind: 'issues', project: 'group/repo', query: { state: 'opened' } }),
    ).toEqual({
      name: 'issues',
      params: { fullPath: 'group/repo' },
      query: { state: 'opened' },
    })
  })

  it('returns null for a focus intent', () => {
    expect(intentToLocation({ kind: 'focus' })).toBeNull()
  })
})
