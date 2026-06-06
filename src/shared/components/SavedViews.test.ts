import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import SavedViews from './SavedViews.vue'
import type { SavedView } from '@/shared/composables/useSavedViews'

const views: SavedView[] = [
  { id: 'a', name: 'My bugs', query: { label: ['bug'], sort: 'priority' } },
  { id: 'b', name: 'Team board', query: { view: 'board', scope: 'team' } },
]

const mountIt = (props = {}) =>
  mount(SavedViews, {
    props: { views, activeId: null, loadedId: null, canSave: true, ...props },
  })

describe('SavedViews', () => {
  it('labels the trigger with the loaded view name', () => {
    const w = mountIt({ loadedId: 'b', activeId: 'b' })
    expect(w.get('[data-testid="views-trigger"]').text()).toContain('Team board')
  })

  it('labels the trigger with the active view name when none was loaded', () => {
    // After navigating away and back the loadedId is gone but the query still
    // matches a saved view (activeId) — the label must still name that view.
    const w = mountIt({ loadedId: null, activeId: 'a' })
    expect(w.get('[data-testid="views-trigger"]').text()).toContain('My bugs')
  })

  it('lists saved views and applies one on click', async () => {
    const w = mountIt()
    await w.get('[data-testid="views-trigger"]').trigger('click')
    await w.get('[data-testid="view-apply-a"]').trigger('click')
    expect(w.emitted('apply')?.at(-1)).toEqual([views[0]])
  })

  it('marks the active view with a check and tints the trigger', () => {
    const w = mountIt({ activeId: 'a' })
    // bookmark icon gets the primary fill when a view is active
    expect(w.get('[data-testid="views-trigger"]').html()).toContain('fill-primary')
  })

  it('creates a new view from a typed name', async () => {
    const w = mountIt()
    await w.get('[data-testid="views-trigger"]').trigger('click')
    await w.get('[data-testid="view-save"]').trigger('click')
    await w.get('[data-testid="view-name-input"]').setValue('Fresh')
    await w.get('form').trigger('submit')
    expect(w.emitted('save')?.at(-1)).toEqual(['Fresh'])
  })

  it('disables save when there is nothing to save', async () => {
    const w = mountIt({ canSave: false })
    await w.get('[data-testid="views-trigger"]').trigger('click')
    expect(w.get('[data-testid="view-save"]').attributes('disabled')).toBeDefined()
  })

  it('renames a view inline', async () => {
    const w = mountIt()
    await w.get('[data-testid="views-trigger"]').trigger('click')
    await w.get('[data-testid="view-rename-a"]').trigger('click')
    await w.get('[data-testid="view-rename-input-a"]').setValue('Renamed')
    await w.get('form').trigger('submit')
    expect(w.emitted('rename')?.at(-1)).toEqual(['a', 'Renamed'])
  })

  it('deletes a view', async () => {
    const w = mountIt()
    await w.get('[data-testid="views-trigger"]').trigger('click')
    await w.get('[data-testid="view-delete-b"]').trigger('click')
    expect(w.emitted('remove')?.at(-1)).toEqual(['b'])
  })

  it('offers update + modified dot when a loaded view has drifted', async () => {
    // loaded 'a' but the live query matches nothing (activeId null) -> modified
    const w = mountIt({ loadedId: 'a', activeId: null })
    expect(w.find('[data-testid="views-modified"]').exists()).toBe(true)
    await w.get('[data-testid="views-trigger"]').trigger('click')
    await w.get('[data-testid="view-update"]').trigger('click')
    expect(w.emitted('update')?.at(-1)).toEqual(['a'])
  })

  it('hides update when the loaded view still matches the query', async () => {
    const w = mountIt({ loadedId: 'a', activeId: 'a' })
    expect(w.find('[data-testid="views-modified"]').exists()).toBe(false)
    await w.get('[data-testid="views-trigger"]').trigger('click')
    expect(w.find('[data-testid="view-update"]').exists()).toBe(false)
  })
})
