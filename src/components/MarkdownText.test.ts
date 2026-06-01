import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import MarkdownText from './MarkdownText.vue'

describe('MarkdownText', () => {
  it('renders sanitized markdown', () => {
    const w = mount(MarkdownText, { props: { source: '**bold**\n\n<img src=x onerror="alert(1)">' } })
    expect(w.html()).toContain('<strong>bold</strong>')
    expect(w.html()).not.toContain('onerror')
  })

  it('renders empty for nullish source', () => {
    const w = mount(MarkdownText, { props: { source: null } })
    expect(w.find('.markdown').text()).toBe('')
  })
})
