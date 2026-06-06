import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import PipelineStatusBadge from './PipelineStatusBadge.vue'

describe('PipelineStatusBadge', () => {
  it('renders the human label for a status', () => {
    expect(mount(PipelineStatusBadge, { props: { status: 'SUCCESS' } }).text()).toBe('Passed')
    expect(mount(PipelineStatusBadge, { props: { status: 'RUNNING' } }).text()).toBe('Running')
  })

  it('spins the icon while running', () => {
    const w = mount(PipelineStatusBadge, { props: { status: 'RUNNING' } })
    expect(w.find('.animate-spin').exists()).toBe(true)
  })

  it('compact mode renders a labelled dot, no text', () => {
    const w = mount(PipelineStatusBadge, { props: { status: 'FAILED', compact: true } })
    expect(w.text()).toBe('')
    expect(w.find('span').attributes('aria-label')).toBe('Failed')
  })

  it('falls back to Unknown for an unrecognized status', () => {
    expect(mount(PipelineStatusBadge, { props: { status: 'WAT' } }).text()).toBe('Unknown')
  })
})
