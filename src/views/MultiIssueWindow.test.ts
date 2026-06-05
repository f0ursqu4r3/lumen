import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const confirmMock = vi.fn()
vi.mock('@/composables/useConfirm', () => ({ useConfirm: () => ({ confirm: confirmMock }) }))

// IssueDetail fetches data; stub it to a marker that shows the iid and can emit dirty.
const IssueDetailStub = {
  name: 'IssueDetail',
  props: ['fullPath', 'iid', 'embedded'],
  emits: ['update:dirty'],
  template: `<div class="detail-stub" :data-iid="iid">
    <button data-testid="make-dirty" @click="$emit('update:dirty', true)" />
  </div>`,
}

import MultiIssueWindow from './MultiIssueWindow.vue'

const mountWindow = (iids: string[]) =>
  mount(MultiIssueWindow, {
    props: { fullPath: 'grp/proj', iids },
    global: { stubs: { IssueDetail: IssueDetailStub } },
  })

beforeEach(() => confirmMock.mockReset())

describe('MultiIssueWindow', () => {
  it('shows the pager position and the first issue', () => {
    const w = mountWindow(['42', '7', '13'])
    expect(w.get('[data-testid="pager-position"]').text()).toBe('1 of 3')
    expect(w.get('.detail-stub').attributes('data-iid')).toBe('42')
  })

  it('disables prev at the start and next at the end', async () => {
    const w = mountWindow(['1', '2'])
    expect(w.get('[data-testid="pager-prev"]').attributes('disabled')).toBeDefined()
    await w.get('[data-testid="pager-next"]').trigger('click')
    expect(w.get('[data-testid="pager-position"]').text()).toBe('2 of 2')
    expect(w.get('[data-testid="pager-next"]').attributes('disabled')).toBeDefined()
  })

  it('advances to the next issue on Next', async () => {
    const w = mountWindow(['42', '7'])
    await w.get('[data-testid="pager-next"]').trigger('click')
    expect(w.get('.detail-stub').attributes('data-iid')).toBe('7')
  })

  it('blocks paging when the page is dirty and discard is cancelled', async () => {
    const w = mountWindow(['1', '2'])
    await w.get('[data-testid="make-dirty"]').trigger('click')
    confirmMock.mockResolvedValue(false)
    await w.get('[data-testid="pager-next"]').trigger('click')
    await flushPromises()
    expect(w.get('[data-testid="pager-position"]').text()).toBe('1 of 2')
  })

  it('pages when the page is dirty and discard is confirmed', async () => {
    const w = mountWindow(['1', '2'])
    await w.get('[data-testid="make-dirty"]').trigger('click')
    confirmMock.mockResolvedValue(true)
    await w.get('[data-testid="pager-next"]').trigger('click')
    await flushPromises()
    expect(w.get('[data-testid="pager-position"]').text()).toBe('2 of 2')
  })

  it('renders 1 of 1 with both buttons disabled for a single iid', () => {
    const w = mountWindow(['9'])
    expect(w.get('[data-testid="pager-position"]').text()).toBe('1 of 1')
    expect(w.get('[data-testid="pager-prev"]').attributes('disabled')).toBeDefined()
    expect(w.get('[data-testid="pager-next"]').attributes('disabled')).toBeDefined()
  })
})
