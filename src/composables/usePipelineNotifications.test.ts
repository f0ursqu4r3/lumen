import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref, nextTick } from 'vue'

const { showNotification } = vi.hoisted(() => ({
  showNotification: vi.fn(() => Promise.resolve({ ok: true as const })),
}))
vi.mock('@/lib/rpc', () => ({ rpc: { showNotification } }))

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

beforeEach(() => showNotification.mockClear())

describe('usePipelineNotifications', () => {
  it('does not alert for an unwatched pipeline, even when it finishes', async () => {
    const list = ref<Pipeline[]>([p({ id: 'a', status: 'RUNNING' })])
    usePipelineNotifications(list, ref('proj'), fakeWatch())
    await nextTick()
    list.value = [p({ id: 'a', status: 'SUCCESS' })]
    await nextTick()
    expect(showNotification).not.toHaveBeenCalled()
  })

  it('alerts and unwatches when a watched run reaches a terminal status', async () => {
    const watch = fakeWatch(['a'])
    const list = ref<Pipeline[]>([p({ id: 'a', status: 'RUNNING' })])
    usePipelineNotifications(list, ref('proj'), watch)
    await nextTick()
    expect(showNotification).not.toHaveBeenCalled() // still running

    list.value = [p({ id: 'a', status: 'SUCCESS' })]
    await nextTick()

    expect(showNotification).toHaveBeenCalledWith({
      title: 'Pipeline passed',
      subtitle: 'proj · main',
      body: '#7',
      silent: true,
    })
    expect(watch.unwatch).toHaveBeenCalledWith('a')
  })

  it('lets failures ring (silent: false)', async () => {
    const watch = fakeWatch(['a'])
    const list = ref<Pipeline[]>([p({ id: 'a', status: 'RUNNING' })])
    usePipelineNotifications(list, ref('proj'), watch)
    await nextTick()
    list.value = [p({ id: 'a', status: 'FAILED' })]
    await nextTick()
    expect(showNotification).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Pipeline failed', silent: false }),
    )
  })

  it('alerts once on load for a subscription that finished while the app was closed', async () => {
    // Persisted watch entry 'a'; the pipeline is already terminal on first fetch.
    const watch = fakeWatch(['a'])
    const list = ref<Pipeline[]>([p({ id: 'a', status: 'SUCCESS' })])
    usePipelineNotifications(list, ref('proj'), watch)
    await nextTick()
    expect(showNotification).toHaveBeenCalledTimes(1)
    expect(watch.unwatch).toHaveBeenCalledWith('a')
  })

  it('does not alert for a watched run that is still active', async () => {
    const list = ref<Pipeline[]>([p({ id: 'a', status: 'PENDING' })])
    usePipelineNotifications(list, ref('proj'), fakeWatch(['a']))
    await nextTick()
    list.value = [p({ id: 'a', status: 'RUNNING' })]
    await nextTick()
    expect(showNotification).not.toHaveBeenCalled()
  })
})
