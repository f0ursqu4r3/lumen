import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import MarkdownText from './MarkdownText.vue'

const { openExternal } = vi.hoisted(() => ({
  openExternal: vi.fn(() => Promise.resolve({ ok: true })),
}))
vi.mock('@/lib/rpc', () => ({ rpc: { openExternal } }))

describe('MarkdownText', () => {
  beforeEach(() => openExternal.mockClear())

  it('renders sanitized markdown', () => {
    const w = mount(MarkdownText, {
      props: { source: '**bold**\n\n<img src=x onerror="alert(1)">' },
    })
    expect(w.html()).toContain('<strong>bold</strong>')
    expect(w.html()).not.toContain('onerror')
  })

  it('renders empty for nullish source', () => {
    const w = mount(MarkdownText, { props: { source: null } })
    expect(w.find('.markdown').text()).toBe('')
  })

  it('opens external links in the host browser instead of navigating in place', async () => {
    const w = mount(MarkdownText, {
      props: { source: '[radar](https://in-the-sky.org/satmap_radar.php?town=5849297)' },
    })
    const link = w.get('a')
    const event = new MouseEvent('click', { bubbles: true, cancelable: true })
    link.element.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
    expect(openExternal).toHaveBeenCalledWith({
      url: 'https://in-the-sky.org/satmap_radar.php?town=5849297',
    })
  })

  it('leaves relative and download links to navigate in place', async () => {
    const w = mount(MarkdownText, {
      props: { source: '[doc](/uploads/a/file.txt) and [anchor](#section)' },
    })
    for (const link of w.findAll('a')) {
      const event = new MouseEvent('click', { bubbles: true, cancelable: true })
      link.element.dispatchEvent(event)
      expect(event.defaultPrevented).toBe(false)
    }
    expect(openExternal).not.toHaveBeenCalled()
  })
})
