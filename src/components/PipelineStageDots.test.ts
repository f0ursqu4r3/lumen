import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import PipelineStageDots from './PipelineStageDots.vue'

const stages = [
  { id: '1', name: 'build', status: 'success' },
  { id: '2', name: 'test', status: 'running' },
  { id: '3', name: 'deploy', status: 'created' },
]

describe('PipelineStageDots', () => {
  it('renders one dot per stage with a name + status tooltip', () => {
    const w = mount(PipelineStageDots, { props: { stages } })
    const dots = w.findAll('[role="listitem"]')
    expect(dots).toHaveLength(3)
    expect(dots[0].attributes('title')).toBe('build · Passed')
    expect(dots[1].attributes('title')).toBe('test · Running')
  })

  it('draws a connector between each pair of stages (n-1 total)', () => {
    const w = mount(PipelineStageDots, { props: { stages } })
    expect(w.findAll('[aria-hidden="true"]')).toHaveLength(2)
  })

  it('renders nothing but the container when there are no stages', () => {
    const w = mount(PipelineStageDots, { props: { stages: [] } })
    expect(w.findAll('[role="listitem"]')).toHaveLength(0)
  })
})
