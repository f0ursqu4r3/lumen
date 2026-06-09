import { describe, it, expect, vi } from 'vitest'
import { mount, RouterLinkStub, flushPromises } from '@vue/test-utils'
import { ref } from 'vue'

vi.mock('@/features/pipelines/composables/usePipelines', () => ({
  usePipelines: () => ({
    pipelines: ref([]),
    isLoading: ref(false),
    isFetching: ref(false),
    error: ref(null),
    refetch: () => {},
  }),
}))
vi.mock('@/features/pipelines/composables/usePipelineWatch', () => ({
  usePipelineWatch: () => ({
    ids: ref([]),
    isWatched: () => false,
    subscribe: () => {},
    unwatch: () => {},
    toggle: () => {},
    watchedCount: ref(0),
  }),
}))
vi.mock('@/features/pipelines/composables/usePipelineNotifications', () => ({
  usePipelineNotifications: () => {},
}))
vi.mock('@/shared/composables/useGitlabUrl', () => ({
  useGitlabUrl: () => ({ toAbsolute: (p: string) => p }),
}))

import PipelineList from './PipelineList.vue'

function mountPipelines() {
  return mount(PipelineList, {
    props: { fullPath: 'grp/proj' },
    global: { stubs: { RouterLink: RouterLinkStub } },
  })
}

describe('PipelineList', () => {
  it('keeps the refresh control after dropping the inline header', async () => {
    const w = mountPipelines()
    await flushPromises()
    expect(w.find('[data-testid="refresh-pipelines"]').exists()).toBe(true)
    expect(w.find('[data-testid="back-to-issues"]').exists()).toBe(false)
  })
})
