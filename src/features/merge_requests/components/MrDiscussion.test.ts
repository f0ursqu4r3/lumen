import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

// Controllable mutation handle so tests can drive pending/error/resolve.
const { mutateAsync, reset, isPending, error } = vi.hoisted(() => ({
  mutateAsync: vi.fn(),
  reset: vi.fn(),
  isPending: { value: false },
  error: { value: null as unknown },
}))
vi.mock('@/features/merge_requests/composables/useMrDiscussion', () => ({
  useMrAddNote: () => ({ mutateAsync, reset, isPending, error }),
}))
// MarkdownText pulls in marked/dompurify; stub it to a plain span.
vi.mock('@/shared/components/MarkdownText.vue', () => ({
  default: { props: ['source'], template: '<span>{{ source }}</span>' },
}))

import MrDiscussion from './MrDiscussion.vue'

const threads = [
  {
    id: 'd1',
    notes: [
      { id: 'n1', body: 'first', system: false, createdAt: 't', author: { username: 'ada' } },
    ],
  },
  {
    id: 'd2',
    notes: [
      { id: 'n2', body: 'second', system: false, createdAt: 't', author: { username: 'lin' } },
    ],
  },
]

function mountDiscussion() {
  return mount(MrDiscussion, {
    props: { threads, fullPath: 'grp/proj', iid: '5', mrId: 'gid://MR/1' },
  })
}

beforeEach(() => {
  mutateAsync.mockReset()
  reset.mockReset()
  isPending.value = false
  error.value = null
})

describe('MrDiscussion', () => {
  it('submits a reply with mrId as noteableId and the thread id as discussionId', async () => {
    mutateAsync.mockResolvedValue({ note: { id: 'n3' } })
    const w = mountDiscussion()
    // Open the first thread's reply box (the per-thread "Reply" button).
    await w
      .findAll('button')
      .find((b) => b.text() === 'Reply')!
      .trigger('click')
    await w.find('textarea').setValue('looks good')
    await w
      .findAll('button')
      .find((b) => b.text() === 'Reply')!
      .trigger('click')
    await flushPromises()
    expect(mutateAsync).toHaveBeenCalledWith({
      noteableId: 'gid://MR/1',
      discussionId: 'd1',
      body: 'looks good',
    })
    // Box closes on success.
    expect(w.find('textarea').exists()).toBe(false)
  })

  it('keeps the box open and shows an error notice when the reply fails', async () => {
    mutateAsync.mockRejectedValue({ kind: 'graphql', message: 'nope' })
    error.value = { kind: 'graphql', message: 'nope' }
    const w = mountDiscussion()
    await w
      .findAll('button')
      .find((b) => b.text() === 'Reply')!
      .trigger('click')
    await w.find('textarea').setValue('hi')
    await w
      .findAll('button')
      .find((b) => b.text() === 'Reply')!
      .trigger('click')
    await flushPromises()
    expect(w.find('textarea').exists()).toBe(true)
    expect(w.text()).toContain('nope')
  })

  it('opens only one reply box at a time', async () => {
    const w = mountDiscussion()
    const threadEls = w.findAll('.rounded-lg')
    // A closed thread shows a single "Reply" button; click thread 1's.
    await threadEls[0].find('button').trigger('click')
    expect(w.findAll('textarea')).toHaveLength(1)
    // Opening thread 2's reply box collapses thread 1's.
    await threadEls[1].find('button').trigger('click')
    expect(w.findAll('textarea')).toHaveLength(1)
  })
})
