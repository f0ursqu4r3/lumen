<script setup lang="ts">
import { computed, toRef } from 'vue'
import { useTitle } from '@vueuse/core'
import {
  ArrowLeft,
  GitBranch,
  ExternalLink,
  RefreshCw,
  LoaderCircle,
  Bell,
  BellRing,
} from '@lucide/vue'
import { usePipelines, type Pipeline } from '@/composables/usePipelines'
import { useGitlabUrl } from '@/composables/useGitlabUrl'
import { usePipelineNotifications } from '@/composables/usePipelineNotifications'
import { usePipelineWatch } from '@/composables/usePipelineWatch'
import { isActivePipeline } from '@/gitlab/pipelineParams'
import PipelineStatusBadge from '@/components/PipelineStatusBadge.vue'
import PipelineStages from '@/components/PipelineStages.vue'
import AssigneeAvatar from '@/components/AssigneeAvatar.vue'
import ErrorNotice from '@/components/ErrorNotice.vue'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { rpc } from '@/lib/rpc'

const props = defineProps<{ fullPath: string }>()

const fullPath = toRef(props, 'fullPath')
const pathParts = computed(() => props.fullPath.split('/'))
const repoName = computed(() => pathParts.value.at(-1) ?? props.fullPath)
const pathPrefix = computed(() => pathParts.value.slice(0, -1).join('/'))

const { pipelines, isLoading, isFetching, error, refetch } = usePipelines(fullPath)
const { toAbsolute } = useGitlabUrl()

// Opt-in alerts: the user arms a per-run bell; that subscription persists until
// the run completes, when usePipelineNotifications pings and clears it.
const watchStore = usePipelineWatch(fullPath)
usePipelineNotifications(pipelines, repoName, watchStore)

useTitle(computed(() => `Pipelines · ${repoName.value} · lumen`))

const runningCount = computed(
  () => pipelines.value.filter((p) => isActivePipeline(p.status)).length,
)

const shortSha = (sha: string | null) => sha?.slice(0, 8) ?? ''

// Staggered list entrance, same cadence as the issue rows (capped so a long list
// doesn't crawl in). New cards arriving on a later poll animate in on their own;
// reordered ones don't replay (keyed nodes move, not remount).
const rowDelay = (i: number) => `${Math.min(i, 14) * 26}ms`

function formatDuration(seconds: number | null): string {
  if (seconds == null) return ''
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return m ? `${m}m ${s}s` : `${s}s`
}

const RELATIVE = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })
const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['day', 86_400],
  ['hour', 3_600],
  ['minute', 60],
  ['second', 1],
]
function timeAgo(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000
  for (const [unit, secs] of UNITS) {
    if (diff >= secs || unit === 'second') return RELATIVE.format(-Math.floor(diff / secs), unit)
  }
  return ''
}

function timing(p: Pipeline): string {
  const started = `started ${timeAgo(p.createdAt)}`
  const dur = formatDuration(p.duration)
  return dur && !isActivePipeline(p.status) ? `${started} · ${dur}` : started
}

function openPipeline(p: Pipeline) {
  const url = toAbsolute(p.path)
  if (url) void rpc.openExternal({ url })
}
</script>

<template>
  <section class="space-y-5">
    <!-- Header: title doubles as the way back to this project's issues. -->
    <div class="flex items-end justify-between gap-4">
      <div class="min-w-0">
        <p
          class="font-mono text-[10px] font-semibold tracking-[0.28em] text-muted-foreground/80 uppercase"
        >
          Pipelines
        </p>
        <RouterLink
          :to="{ name: 'issues', params: { fullPath } }"
          data-testid="back-to-issues"
          class="group/back -ml-1 mt-2 flex max-w-full items-center gap-2 rounded-md px-1 outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring/50"
        >
          <ArrowLeft
            class="size-5 shrink-0 text-primary transition-transform group-hover/back:-translate-x-0.5"
          />
          <h1
            class="min-w-0 truncate text-[1.875rem] leading-none font-semibold tracking-[-0.02em] text-foreground"
          >
            {{ repoName }}
          </h1>
        </RouterLink>
        <p v-if="pathPrefix" class="mt-1.5 truncate font-mono text-xs text-muted-foreground/75">
          {{ pathPrefix }}/
        </p>
      </div>
      <div class="flex shrink-0 items-center gap-3">
        <span
          v-if="runningCount"
          class="inline-flex items-center gap-1.5 rounded-full border border-sky-500/25 bg-sky-500/10 px-2.5 py-0.5 text-xs font-medium text-sky-300"
        >
          <LoaderCircle class="size-3.5 animate-spin" />
          {{ runningCount }} running
        </span>
        <span
          v-if="watchStore.watchedCount.value"
          class="animate-status inline-flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary"
        >
          <BellRing class="size-3.5" />
          {{ watchStore.watchedCount.value }} watching
        </span>
        <Button
          variant="outline"
          size="sm"
          data-testid="refresh-pipelines"
          :disabled="isFetching"
          @click="() => refetch()"
        >
          <RefreshCw :class="isFetching ? 'animate-spin' : ''" />
          Refresh
        </Button>
      </div>
    </div>

    <ErrorNotice v-if="error" :error="error" />

    <!-- Loading skeletons -->
    <div v-else-if="isLoading" class="space-y-3">
      <Skeleton v-for="i in 4" :key="i" class="h-28 w-full rounded-xl" />
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
        class="mt-3 font-mono text-[10px] font-semibold tracking-[0.28em] text-muted-foreground/70 uppercase"
      >
        Standby
      </p>
      <p class="mt-2 text-sm font-medium text-foreground">No pipelines in range</p>
      <p class="mt-1 max-w-sm text-sm text-muted-foreground">
        The last 20 runs land here. Push a commit or open a merge request to light this up.
      </p>
    </div>

    <!-- Pipeline list -->
    <ul v-else class="space-y-3">
      <li v-for="(p, i) in pipelines" :key="p.id">
        <!-- A watched run wears a faint primary ring — a quiet "eye on this"
             state signal, no stripe. -->
        <Card
          class="animate-row-in overflow-hidden transition-shadow"
          :class="watchStore.isWatched(p.id) ? 'ring-1 ring-primary/20' : ''"
          :style="{ animationDelay: rowDelay(i) }"
        >
          <CardHeader class="gap-0">
            <div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
              <div class="flex min-w-0 items-center gap-3">
                <!-- Keyed on status so a run advancing (running → passed) replays
                     the settle; unchanged polls leave it still. -->
                <PipelineStatusBadge :key="p.status" :status="p.status" class="animate-status" />
                <span class="inline-flex min-w-0 items-center gap-1.5 text-sm text-foreground">
                  <GitBranch class="size-3.5 shrink-0 text-muted-foreground" />
                  <span class="truncate font-medium">{{ p.ref }}</span>
                </span>
                <code v-if="p.sha" class="font-mono text-xs text-muted-foreground">{{
                  shortSha(p.sha)
                }}</code>
              </div>
              <div class="flex shrink-0 items-center gap-3">
                <AssigneeAvatar
                  v-if="p.user"
                  :name="p.user.name"
                  :username="p.user.username"
                  :avatar-url="p.user.avatarUrl"
                />
                <span class="font-mono text-xs text-muted-foreground/80">#{{ p.iid }}</span>
                <!-- Per-run alert toggle. Only in-flight runs can be armed; once
                     finished there's nothing to wait for. -->
                <Button
                  v-if="isActivePipeline(p.status)"
                  variant="ghost"
                  size="icon-sm"
                  :data-testid="`watch-${p.iid}`"
                  :aria-pressed="watchStore.isWatched(p.id)"
                  :class="watchStore.isWatched(p.id) ? 'text-primary' : 'text-muted-foreground'"
                  :title="
                    watchStore.isWatched(p.id)
                      ? 'Stop alerting when this finishes'
                      : 'Alert me when this finishes'
                  "
                  :aria-label="
                    watchStore.isWatched(p.id)
                      ? `Stop alerting for pipeline #${p.iid}`
                      : `Alert me when pipeline #${p.iid} finishes`
                  "
                  @click="watchStore.toggle(p.id)"
                >
                  <!-- Armed: the bell breathes amber while the run is in flight —
                       the liveness-lamp idiom, meaning "listening for this one."
                       The breath starting on arm is the confirmation. -->
                  <BellRing v-if="watchStore.isWatched(p.id)" class="bell-listening" />
                  <Bell v-else />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  :disabled="!toAbsolute(p.path)"
                  :title="`Open pipeline #${p.iid} in GitLab`"
                  :aria-label="`Open pipeline #${p.iid} in GitLab`"
                  @click="openPipeline(p)"
                >
                  <ExternalLink />
                </Button>
              </div>
            </div>
            <p class="mt-1 text-xs text-muted-foreground/80">{{ timing(p) }}</p>
          </CardHeader>
          <CardContent v-if="p.stages.length">
            <PipelineStages :stages="p.stages" />
          </CardContent>
        </Card>
      </li>
    </ul>
  </section>
</template>
