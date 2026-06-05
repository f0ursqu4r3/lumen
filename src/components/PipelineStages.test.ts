import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import PipelineStages from './PipelineStages.vue'
import { StepperTitle } from './ui/stepper'

const stages = [
  { id: '1', name: 'build', status: 'success' },
  { id: '2', name: 'test', status: 'running' },
  { id: '3', name: 'deploy', status: 'created' },
]

describe('PipelineStages', () => {
  it('renders one labelled step per stage', () => {
    const w = mount(PipelineStages, { props: { stages } })
    const titles = w.findAllComponents(StepperTitle).map((t) => t.text())
    expect(titles).toEqual(['build', 'test', 'deploy'])
  })

  it('spins the indicator of a running stage (lowercase status normalized)', () => {
    const w = mount(PipelineStages, { props: { stages } })
    expect(w.find('.animate-spin').exists()).toBe(true)
  })

  it('renders nothing when there are no stages', () => {
    const w = mount(PipelineStages, { props: { stages: [] } })
    expect(w.findComponent(StepperTitle).exists()).toBe(false)
  })
})
