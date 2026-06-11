<script setup lang="ts">
import { GitBranch, ExternalLink, Bell, BellRing, ChevronRight } from '@lucide/vue'
import { Button } from '@/shared/ui/button'
import PipelineStatusBadge from '@/features/pipelines/components/PipelineStatusBadge.vue'
import PipelineStages from '@/features/pipelines/components/PipelineStages.vue'
import PipelineStageDots from '@/features/pipelines/components/PipelineStageDots.vue'
import AssigneeAvatar from '@/features/assignees/components/AssigneeAvatar.vue'
import { shortSha, timing } from '@/features/pipelines/lib/pipelineFormat'
import type { Pipeline } from '@/features/pipelines/composables/usePipelines'

defineProps<{
  pipeline: Pipeline
  index: number
  open: boolean
  watched: boolean
  canWatch: boolean
  href: string | null
}>()

defineEmits<{ 'toggle-open': []; 'toggle-watch': []; open: [] }>()

const rowDelay = (i: number) => `${Math.min(i, 14) * 26}ms`
</script>

<template>
  <li
    class="animate-row-in transition-colors"
    :class="watched ? 'bg-primary/5' : ''"
    :style="{ animationDelay: rowDelay(index) }"
  >
    <div class="flex items-center gap-2 pr-2">
      <!-- The row header doubles as the expand toggle — a real <button> when
           there are stages to reveal, inert text otherwise. -->
      <component
        :is="pipeline.stages.length ? 'button' : 'div'"
        :type="pipeline.stages.length ? 'button' : undefined"
        :data-testid="`pipeline-row-${pipeline.iid}`"
        class="flex min-w-0 flex-1 items-center gap-3 py-2.5 pr-2 pl-3 text-left outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring/50"
        :class="pipeline.stages.length ? 'cursor-pointer' : 'cursor-default'"
        :aria-expanded="pipeline.stages.length ? open : undefined"
        @click="pipeline.stages.length && $emit('toggle-open')"
      >
        <ChevronRight
          class="size-4 shrink-0 text-muted-foreground/70 transition-transform"
          :class="[open ? 'rotate-90' : '', pipeline.stages.length ? '' : 'invisible']"
        />
        <!-- Keyed on status so a run advancing (running → passed) replays the
             settle; unchanged polls leave it still. -->
        <PipelineStatusBadge
          :key="pipeline.status"
          :status="pipeline.status"
          class="animate-status shrink-0"
        />
        <span class="inline-flex min-w-0 items-center gap-1.5 text-sm">
          <GitBranch class="size-3.5 shrink-0 text-muted-foreground" />
          <span class="truncate font-medium text-foreground">{{ pipeline.ref }}</span>
        </span>
        <code
          v-if="pipeline.sha"
          :title="pipeline.sha"
          class="hidden shrink-0 font-mono text-xs text-muted-foreground sm:inline"
          >{{ shortSha(pipeline.sha) }}</code
        >
        <PipelineStageDots
          v-if="pipeline.stages.length"
          :stages="pipeline.stages"
          class="hidden shrink-0 md:flex"
        />
        <span class="ml-auto shrink-0 pl-2 text-xs whitespace-nowrap text-muted-foreground/80">{{
          timing(pipeline)
        }}</span>
      </component>

      <!-- Actions live outside the toggle so they never trip the expand. -->
      <div class="flex shrink-0 items-center gap-1">
        <AssigneeAvatar
          v-if="pipeline.user"
          compact
          class="hidden sm:inline-flex"
          :name="pipeline.user.name"
          :username="pipeline.user.username"
          :avatar-url="pipeline.user.avatarUrl"
        />
        <span class="font-mono text-xs text-muted-foreground/80">#{{ pipeline.iid }}</span>
        <!-- Per-run alert toggle. Only in-flight runs can be armed; once
             finished there's nothing to wait for. -->
        <Button
          v-if="canWatch"
          variant="ghost"
          size="icon-sm"
          :data-testid="`watch-${pipeline.iid}`"
          :aria-pressed="watched"
          :class="watched ? 'text-primary hover:text-primary' : 'text-muted-foreground'"
          :title="watched ? 'Stop alerting when this finishes' : 'Alert me when this finishes'"
          :aria-label="
            watched
              ? `Stop alerting for pipeline #${pipeline.iid}`
              : `Alert me when pipeline #${pipeline.iid} finishes`
          "
          @click="$emit('toggle-watch')"
        >
          <!-- Armed: the bell breathes in the accent while the run is in flight — the
               liveness-lamp idiom, meaning "listening for this one." The breath
               starting on arm is the confirmation. -->
          <BellRing v-if="watched" class="bell-listening" />
          <Bell v-else />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          :disabled="!href"
          :title="`Open pipeline #${pipeline.iid} in GitLab`"
          :aria-label="`Open pipeline #${pipeline.iid} in GitLab`"
          @click="$emit('open')"
        >
          <ExternalLink />
        </Button>
      </div>
    </div>

    <!-- Expandable stepper. grid-rows 0fr↔1fr animates height without
         measuring; reduced-motion snaps it open. -->
    <div
      v-if="pipeline.stages.length"
      class="grid ease-out motion-safe:transition-[grid-template-rows] motion-safe:duration-200"
      :class="open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'"
    >
      <div class="overflow-hidden">
        <div class="border-t border-border/60 px-3 pt-3 pb-3">
          <PipelineStages :stages="pipeline.stages" />
        </div>
      </div>
    </div>
  </li>
</template>
