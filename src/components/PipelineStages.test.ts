import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import PipelineStages from './PipelineStages.vue'

const stages = [
  {
    id: '1',
    name: 'build',
    status: 'success',
    jobs: [
      { id: 'j1', name: 'compile', status: 'success' },
      { id: 'j2', name: 'docker-build', status: 'success' },
    ],
  },
  {
    id: '2',
    name: 'test',
    status: 'running',
    jobs: [{ id: 'j3', name: 'unit', status: 'running' }],
  },
  { id: '3', name: 'deploy', status: 'created', jobs: [] },
]

describe('PipelineStages', () => {
  it('renders a card per stage with its name', () => {
    const w = mount(PipelineStages, { props: { stages } })
    const names = w.findAll('h4').map((h) => h.text())
    expect(names).toEqual(['build', 'test', 'deploy'])
  })

  it('lists the actual jobs under each stage', () => {
    const w = mount(PipelineStages, { props: { stages } })
    const jobs = w.findAll('li').map((li) => li.text())
    expect(jobs).toEqual(['compile', 'docker-build', 'unit'])
  })

  it('spins the indicator of a running job (lowercase status normalized)', () => {
    const w = mount(PipelineStages, { props: { stages } })
    expect(w.find('.animate-spin').exists()).toBe(true)
  })

  it('shows a placeholder for a stage with no jobs', () => {
    const w = mount(PipelineStages, { props: { stages } })
    expect(w.text()).toContain('No jobs')
  })

  it('renders nothing when there are no stages', () => {
    const w = mount(PipelineStages, { props: { stages: [] } })
    expect(w.find('h4').exists()).toBe(false)
  })
})
