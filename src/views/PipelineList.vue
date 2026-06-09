<script setup lang="ts">
import { computed, ref, toRef } from 'vue'
import { useTitle } from '@vueuse/core'
import { RefreshCw } from '@lucide/vue'
import { usePipelines, type Pipeline } from '@/features/pipelines/composables/usePipelines'
import { useGitlabUrl } from '@/shared/composables/useGitlabUrl'
import { useRepoPath } from '@/shared/composables/useRepoPath'
import { usePipelineNotifications } from '@/features/pipelines/composables/usePipelineNotifications'
import { usePipelineWatch } from '@/features/pipelines/composables/usePipelineWatch'
import { isActivePipeline } from '@/gitlab/pipelineParams'
import ErrorNotice from '@/shared/components/ErrorNotice.vue'
import ViewContainer from '@/shared/components/shell/ViewContainer.vue'
import { Button } from '@/shared/ui/button'
import { Skeleton } from '@/shared/ui/skeleton'
import { rpc } from '@/shared/lib/rpc'
import PipelineRow from '@/features/pipelines/components/PipelineRow.vue'

const props = defineProps<{ fullPath: string }>()

const fullPath = toRef(props, 'fullPath')
const { repoName } = useRepoPath(fullPath)

const { pipelines, isLoading, isFetching, error, refetch } = usePipelines(fullPath)
const { toAbsolute } = useGitlabUrl()

// Opt-in alerts: the user arms a per-run bell; that subscription persists until
// the run completes, when usePipelineNotifications raises a toast (+ an OS
// notification when the app isn't active) and clears it. The href lets the toast
// open the run in GitLab.
const watchStore = usePipelineWatch(fullPath)
usePipelineNotifications(pipelines, repoName, watchStore, (p) => toAbsolute(p.path))

useTitle(computed(() => `Pipelines · ${repoName.value} · lumen`))

// Rows are compact by default; the full labeled stage stepper drops down on
// demand. Multi-expand (a Set, not a single id) so you can pin several open.
const expanded = ref(new Set<string>())
const isOpen = (id: string) => expanded.value.has(id)
function toggleOpen(id: string) {
  const next = new Set(expanded.value)
  if (!next.delete(id)) next.add(id)
  expanded.value = next
}

function openPipeline(p: Pipeline) {
  const url = toAbsolute(p.path)
  if (url) void rpc.openExternal({ url })
}
</script>

<template>
  <ViewContainer>
    <div class="mb-5 flex justify-end">
      <Button
        variant="outline"
        size="sm"
        data-testid="refresh-pipelines"
        :disabled="isFetching"
        @click="() => refetch()"
      >
        <RefreshCw :class="isFetching ? 'animate-spin' : ''" />
      </Button>
    </div>

    <ErrorNotice v-if="error" :error="error" />

    <!-- Loading skeletons: collapsed-row height. -->
    <div v-else-if="isLoading" class="space-y-1.5">
      <Skeleton v-for="i in 6" :key="i" class="h-12 w-full rounded-xl" />
    </div>

    <!-- Empty state: the instrument at standby. A steady (idle, not breathing)
         signal lamp + operational copy, in the same voice as the section eyebrow. -->
    <div
      v-else-if="!pipelines.length"
      class="flex flex-col items-center rounded-xl border border-dashed border-border py-16 text-center"
    >
      <span
        class="size-2 rounded-full bg-primary shadow-[0_0_8px_oklch(0.82_0.142_81/0.5)]"
        aria-hidden="true"
      />
      <p
        class="mt-3 font-mono text-micro font-semibold tracking-[0.28em] text-muted-foreground/80 uppercase"
      >
        Standby
      </p>
      <p class="mt-2 text-sm font-medium text-foreground">No pipelines in range</p>
      <p class="mt-1 max-w-sm text-sm text-muted-foreground">
        The last 20 runs land here. Push a commit or open a merge request to light this up.
      </p>
    </div>

    <!-- Pipeline list: compact rows, each expanding to the full labeled stepper.
         A watched run wears a faint primary ring — a quiet "eye on this" signal,
         no stripe. -->
    <ul v-else class="space-y-1.5">
      <PipelineRow
        v-for="(p, i) in pipelines"
        :key="p.id"
        :pipeline="p"
        :index="i"
        :open="isOpen(p.id)"
        :watched="watchStore.isWatched(p.id)"
        :can-watch="isActivePipeline(p.status)"
        :href="toAbsolute(p.path)"
        @toggle-open="toggleOpen(p.id)"
        @toggle-watch="watchStore.toggle(p.id)"
        @open="openPipeline(p)"
      />
    </ul>
  </ViewContainer>
</template>
