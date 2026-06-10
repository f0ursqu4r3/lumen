<script setup lang="ts">
import { ref, toRef } from 'vue'
import { useMrFilters } from '@/features/merge_requests/composables/useMrFilters'
import { useMergeRequests } from '@/features/merge_requests/composables/useMergeRequests'
import { useMrSavedViews } from '@/features/merge_requests/composables/useMrSavedViews'
import MergeRequestListToolbar from '@/features/merge_requests/components/MergeRequestListToolbar.vue'
import MrFilterPanel from '@/features/merge_requests/components/MrFilterPanel.vue'
import MergeRequestRow from '@/features/merge_requests/components/MergeRequestRow.vue'
import ErrorNotice from '@/shared/components/ErrorNotice.vue'
import ViewContainer from '@/shared/components/shell/ViewContainer.vue'

const props = defineProps<{ fullPath: string }>()
const fullPath = toRef(props, 'fullPath')

const f = useMrFilters()
const { mergeRequests, isLoading, error, hasNextPage, fetchNextPage, isFetchingNextPage, refetch } =
  useMergeRequests(fullPath, f.filters)

const saved = useMrSavedViews(fullPath, f.viewSlice, f.applyView)

// Manual refresh: force a refetch on demand. A dedicated flag (not the query's
// `isFetching`) drives the spinner so it reflects only the user's click, not the
// background poll or pagination fetches.
const isRefreshing = ref(false)
async function refresh() {
  if (isRefreshing.value) return
  isRefreshing.value = true
  try {
    await refetch()
  } finally {
    isRefreshing.value = false
  }
}
</script>

<template>
  <ViewContainer>
    <MergeRequestListToolbar
      v-model:state="f.state.value"
      v-model:search="f.search.value"
      v-model:sort="f.sort.value"
      :count="mergeRequests.length"
      :has-more="hasNextPage ?? false"
      :is-refreshing="isRefreshing"
      :views="saved.savedViews.views.value"
      @refresh="refresh"
      :active-id="saved.activeViewId.value"
      :loaded-id="saved.loadedViewId.value"
      :can-save="saved.canSaveView.value"
      @apply="saved.loadView"
      @save="saved.saveCurrentView"
      @update="saved.updateView"
      @rename="(id, name) => saved.savedViews.rename(id, name)"
      @remove="saved.removeView"
    >
      <template #filters>
        <MrFilterPanel
          v-model:draft="f.draft.value"
          v-model:author="f.author.value"
          v-model:assignee="f.assignee.value"
          v-model:reviewer="f.reviewer.value"
          v-model:milestone="f.milestone.value"
          :active-count="f.activeCount.value"
          @clear="f.clearAll"
        />
      </template>
    </MergeRequestListToolbar>

    <ErrorNotice v-if="error" :error="error" class="mt-6" />

    <div v-else-if="isLoading" class="mt-6 text-sm text-muted-foreground">Loading…</div>

    <p v-else-if="!mergeRequests.length" class="mt-16 text-center text-sm text-muted-foreground">
      No merge requests match these filters.
    </p>

    <ul v-else class="mt-6 divide-y divide-border/60">
      <li v-for="mr in mergeRequests" :key="mr.iid">
        <MergeRequestRow :mr="mr" :full-path="fullPath" />
      </li>
    </ul>

    <div v-if="hasNextPage" class="mt-4 flex justify-center">
      <button
        type="button"
        class="rounded-md border border-border px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent/50 disabled:opacity-50"
        :disabled="isFetchingNextPage"
        @click="fetchNextPage()"
      >
        {{ isFetchingNextPage ? 'Loading…' : 'Load more' }}
      </button>
    </div>
  </ViewContainer>
</template>
