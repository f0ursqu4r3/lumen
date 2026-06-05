import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref, nextTick } from 'vue'

const { showNotification } = vi.hoisted(() => ({
  showNotification: vi.fn(() => Promise.resolve({ ok: true as const })),
}))
vi.mock('@/lib/rpc', () => ({ rpc: { showNotification } }))

const { pushToast } = vi.hoisted(() => ({ pushToast: vi.fn() }))
vi.mock('@/composables/useToast', () => ({ pushToast }))

// Default to "app not active" so the OS-notification path runs unless a test
// overrides it.
const { isAppActive } = vi.hoisted(() => ({ isAppActive: vi.fn(() => false) }))
vi.mock('@/lib/appActive', () => ({ isAppActive }))

import { usePipelineNotifications } from './usePipelineNotifications'
import type { Pipeline } from './usePipelines'

const p = (over: Partial<Pipeline> & { id: string; status: string }): Pipeline =>
  ({ iid: '7', ref: 'main', ...over }) as Pipeline

// A stand-in for the watch store backed by a Set so we can assert pruning.
function fakeWatch(initial: string[] = []) {
  const set = new Set(initial)
  return {
    set,
    isWatched: (id: string) => set.has(id),
    unwatch: vi.fn((id: string) => set.delete(id)),
  }
}

beforeEach(() => {
  showNotification.mockClear()
  pushToast.mockClear()
  isAppActive.mockReturnValue(false)
})

describe('usePipelineNotifications', () => {
  it('does not alert for an unwatched pipeline, even when it finishes', async () => {
    const list = ref<Pipeline[]>([p({ id: 'a', status: 'RUNNING' })])
    usePipelineNotifications(list, ref('proj'), fakeWatch())
    await nextTick()
    list.value = [p({ id: 'a', status: 'SUCCESS' })]
    await nextTick()
    expect(pushToast).not.toHaveBeenCalled()
    expect(showNotification).not.toHaveBeenCalled()
  })

  it('raises a toast and unwatches when a watched run finishes', async () => {
    const watch = fakeWatch(['a'])
    const list = ref<Pipeline[]>([p({ id: 'a', status: 'RUNNING' })])
    usePipelineNotifications(list, ref('proj'), watch, (pl) => `https://gl/${pl.id}`)
    await nextTick()
    expect(pushToast).not.toHaveBeenCalled() // still running

    list.value = [p({ id: 'a', status: 'SUCCESS' })]
    await nextTick()

    expect(pushToast).toHaveBeenCalledWith({
      title: 'Pipeline passed',
      description: 'proj · main · #7',
      tone: 'success',
      href: 'https://gl/a',
    })
    expect(watch.unwatch).toHaveBeenCalledWith('a')
  })

  it('also fires an OS notification when the app is NOT active', async () => {
    isAppActive.mockReturnValue(false)
    const list = ref<Pipeline[]>([p({ id: 'a', status: 'FAILED' })])
    usePipelineNotifications(list, ref('proj'), fakeWatch(['a']))
    await nextTick()
    expect(pushToast).toHaveBeenCalledWith(expect.objectContaining({ tone: 'failed' }))
    expect(showNotification).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Pipeline failed', silent: false }),
    )
  })

  it('shows only the toast (no OS notification) when the app IS active', async () => {
    isAppActive.mockReturnValue(true)
    const list = ref<Pipeline[]>([p({ id: 'a', status: 'SUCCESS' })])
    usePipelineNotifications(list, ref('proj'), fakeWatch(['a']))
    await nextTick()
    expect(pushToast).toHaveBeenCalledTimes(1)
    expect(showNotification).not.toHaveBeenCalled()
  })

  it('does not alert for a watched run that is still active', async () => {
    const list = ref<Pipeline[]>([p({ id: 'a', status: 'PENDING' })])
    usePipelineNotifications(list, ref('proj'), fakeWatch(['a']))
    await nextTick()
    list.value = [p({ id: 'a', status: 'RUNNING' })]
    await nextTick()
    expect(pushToast).not.toHaveBeenCalled()
  })
})
