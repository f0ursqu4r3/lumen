<script setup lang="ts">
import { computed, ref, toRef } from 'vue'
import { useTitle } from '@vueuse/core'
import {
  ArrowLeft,
  GitBranch,
  ExternalLink,
  RefreshCw,
  LoaderCircle,
  Bell,
  BellRing,
  ChevronRight,
} from '@lucide/vue'
import { usePipelines, type Pipeline } from '@/composables/usePipelines'
import { useGitlabUrl } from '@/composables/useGitlabUrl'
import { usePipelineNotifications } from '@/composables/usePipelineNotifications'
import { usePipelineWatch } from '@/composables/usePipelineWatch'
import { isActivePipeline } from '@/gitlab/pipelineParams'
import PipelineStatusBadge from '@/components/PipelineStatusBadge.vue'
import PipelineStages from '@/components/PipelineStages.vue'
import PipelineStageDots from '@/components/PipelineStageDots.vue'
import AssigneeAvatar from '@/components/AssigneeAvatar.vue'
import ErrorNotice from '@/shared/components/ErrorNotice.vue'
import { Button } from '@/shared/ui/button'
import { Skeleton } from '@/shared/ui/skeleton'
import { rpc } from '@/lib/rpc'
import { nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { withViewTransition } from '@/lib/viewTransition'

const props = defineProps<{ fullPath: string }>()

const router = useRouter()

// Hopping back to this project's issues morphs the shared repo title and
// cross-fades the rest — the mirror of the issues → pipelines handoff. Modified
// clicks fall through to the real href.
function onTabNav(e: MouseEvent, to: Parameters<typeof router.push>[0]) {
  if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
  e.preventDefault()
  withViewTransition(async () => {
    await router.push(to)
    await nextTick()
  })
}

const fullPath = toRef(props, 'fullPath')
const pathParts = computed(() => props.fullPath.split('/'))
const repoName = computed(() => pathParts.value.at(-1) ?? props.fullPath)
const pathPrefix = computed(() => pathParts.value.slice(0, -1).join('/'))

const { pipelines, isLoading, isFetching, error, refetch } = usePipelines(fullPath)
const { toAbsolute } = useGitlabUrl()

// Opt-in alerts: the user arms a per-run bell; that subscription persists until
// the run completes, when usePipelineNotifications raises a toast (+ an OS
// notification when the app isn't active) and clears it. The href lets the toast
// open the run in GitLab.
const watchStore = usePipelineWatch(fullPath)
usePipelineNotifications(pipelines, repoName, watchStore, (p) => toAbsolute(p.path))

useTitle(computed(() => `Pipelines · ${repoName.value} · lumen`))

// Everything still in flight (running, but also pending/manual/scheduled), so the
// label reads "active" rather than the narrower "running".
const activeCount = computed(() => pipelines.value.filter((p) => isActivePipeline(p.status)).length)

const shortSha = (sha: string | null) => sha?.slice(0, 8) ?? ''

// Staggered list entrance, same cadence as the issue rows (capped so a long list
// doesn't crawl in). New rows arriving on a later poll animate in on their own;
// reordered ones don't replay (keyed nodes move, not remount).
const rowDelay = (i: number) => `${Math.min(i, 14) * 26}ms`

// Rows are compact by default; the full labeled stage stepper drops down on
// demand. Multi-expand (a Set, not a single id) so you can pin several open.
const expanded = ref(new Set<string>())
const isOpen = (id: string) => expanded.value.has(id)
function toggleOpen(id: string) {
  const next = new Set(expanded.value)
  if (!next.delete(id)) next.add(id)
  expanded.value = next
}

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
  const ago = timeAgo(p.createdAt)
  const dur = formatDuration(p.duration)
  return dur && !isActivePipeline(p.status) ? `${ago} · ${dur}` : ago
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
          class="eyebrow-tick font-mono text-micro font-semibold tracking-[0.28em] text-muted-foreground/80 uppercase"
        >
          Pipelines
        </p>
        <RouterLink
          :to="{ name: 'issues', params: { fullPath } }"
          data-testid="back-to-issues"
          class="group/back -ml-1 mt-2 flex max-w-full items-center gap-2 rounded-md px-1 outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring/50"
          @click="onTabNav($event, { name: 'issues', params: { fullPath } })"
        >
          <ArrowLeft
            class="size-5 shrink-0 text-primary transition-transform group-hover/back:-translate-x-0.5"
          />
          <h1
            class="vt-project-title min-w-0 truncate text-title leading-none font-semibold text-foreground"
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
          v-if="activeCount"
          class="inline-flex items-center gap-1.5 rounded-full border border-sky-500/25 bg-sky-500/10 px-2.5 py-0.5 text-xs font-medium text-sky-300"
        >
          <LoaderCircle class="size-3.5 animate-spin" />
          {{ activeCount }} active
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
        </Button>
      </div>
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
      <li
        v-for="(p, i) in pipelines"
        :key="p.id"
        class="animate-row-in overflow-hidden rounded-xl border border-border bg-card transition-shadow"
        :class="watchStore.isWatched(p.id) ? 'ring-1 ring-primary/20' : ''"
        :style="{ animationDelay: rowDelay(i) }"
      >
        <div class="flex items-center gap-2 pr-2">
          <!-- The row header doubles as the expand toggle — a real <button> when
               there are stages to reveal, inert text otherwise. -->
          <component
            :is="p.stages.length ? 'button' : 'div'"
            :type="p.stages.length ? 'button' : undefined"
            :data-testid="`pipeline-row-${p.iid}`"
            class="flex min-w-0 flex-1 items-center gap-3 rounded-l-xl py-2.5 pr-2 pl-3 text-left outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring/50"
            :class="p.stages.length ? 'cursor-pointer' : 'cursor-default'"
            :aria-expanded="p.stages.length ? isOpen(p.id) : undefined"
            @click="p.stages.length && toggleOpen(p.id)"
          >
            <ChevronRight
              class="size-4 shrink-0 text-muted-foreground/70 transition-transform"
              :class="[isOpen(p.id) ? 'rotate-90' : '', p.stages.length ? '' : 'invisible']"
            />
            <!-- Keyed on status so a run advancing (running → passed) replays the
                 settle; unchanged polls leave it still. -->
            <PipelineStatusBadge
              :key="p.status"
              :status="p.status"
              class="animate-status shrink-0"
            />
            <span class="inline-flex min-w-0 items-center gap-1.5 text-sm">
              <GitBranch class="size-3.5 shrink-0 text-muted-foreground" />
              <span class="truncate font-medium text-foreground">{{ p.ref }}</span>
            </span>
            <code
              v-if="p.sha"
              :title="p.sha"
              class="hidden shrink-0 font-mono text-xs text-muted-foreground sm:inline"
              >{{ shortSha(p.sha) }}</code
            >
            <PipelineStageDots
              v-if="p.stages.length"
              :stages="p.stages"
              class="hidden shrink-0 md:flex"
            />
            <span
              class="ml-auto shrink-0 pl-2 text-xs whitespace-nowrap text-muted-foreground/80"
              >{{ timing(p) }}</span
            >
          </component>

          <!-- Actions live outside the toggle so they never trip the expand. -->
          <div class="flex shrink-0 items-center gap-1">
            <AssigneeAvatar
              v-if="p.user"
              compact
              class="hidden sm:inline-flex"
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
              :class="
                watchStore.isWatched(p.id)
                  ? 'text-primary hover:text-primary'
                  : 'text-muted-foreground'
              "
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
              <!-- Armed: the bell breathes amber while the run is in flight — the
                   liveness-lamp idiom, meaning "listening for this one." The breath
                   starting on arm is the confirmation. -->
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

        <!-- Expandable stepper. grid-rows 0fr↔1fr animates height without
             measuring; reduced-motion snaps it open. -->
        <div
          v-if="p.stages.length"
          class="grid ease-out motion-safe:transition-[grid-template-rows] motion-safe:duration-200"
          :class="isOpen(p.id) ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'"
        >
          <div class="overflow-hidden">
            <div class="border-t border-border/60 px-3 pt-3 pb-3">
              <PipelineStages :stages="p.stages" />
            </div>
          </div>
        </div>
      </li>
    </ul>
  </section>
</template>
