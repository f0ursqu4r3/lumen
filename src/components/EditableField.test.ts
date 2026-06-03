import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import EditableField from './EditableField.vue'

const mountField = (editing = false) =>
  mount(EditableField, {
    props: { editing, label: 'Title' },
    slots: {
      view: "<div data-testid='v'>VIEW</div>",
      edit: "<div data-testid='e'>EDIT</div>",
    },
  })

describe('EditableField', () => {
  it('shows the view slot and hides edit when not editing', () => {
    const w = mountField(false)
    expect(w.find('[data-testid="v"]').exists()).toBe(true)
    expect(w.find('[data-testid="e"]').exists()).toBe(false)
  })

  it('shows the edit slot and hides view when editing', () => {
    const w = mountField(true)
    expect(w.find('[data-testid="e"]').exists()).toBe(true)
    expect(w.find('[data-testid="v"]').exists()).toBe(false)
  })

  it('toggle emits update:editing with the flipped value', async () => {
    const w = mountField(false)
    await w.get('[data-testid="editable-toggle"]').trigger('click')
    expect(w.emitted('update:editing')?.at(-1)).toEqual([true])
  })

  it('toggle reads Edit when rendered and Preview when editing', () => {
    expect(mountField(false).get('[data-testid="editable-toggle"]').text()).toContain('Edit')
    expect(mountField(true).get('[data-testid="editable-toggle"]').text()).toContain('Preview')
  })

  it('honors a custom toggle testid', async () => {
    const w = mount(EditableField, {
      props: { editing: false, label: 'Title', toggleTestid: 'x-toggle' },
      slots: { view: '<i>v</i>', edit: '<i>e</i>' },
    })
    await w.get('[data-testid="x-toggle"]').trigger('click')
    expect(w.emitted('update:editing')?.at(-1)).toEqual([true])
  })

  it('Escape while editing emits update:editing false', async () => {
    const w = mountField(true)
    await w.trigger('keydown', { key: 'Escape' })
    expect(w.emitted('update:editing')?.at(-1)).toEqual([false])
  })

  it('Escape while not editing does not emit', async () => {
    const w = mountField(false)
    await w.trigger('keydown', { key: 'Escape' })
    expect(w.emitted('update:editing')).toBeUndefined()
  })
})
