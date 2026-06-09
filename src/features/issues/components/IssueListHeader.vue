<script setup lang="ts">
import { Plus, ArrowLeft, Workflow, GitMerge } from '@lucide/vue'
import { Button } from '@/shared/ui/button'
import Odometer from '@/shared/components/Odometer.vue'
import { useTabNav } from '@/shared/composables/useTabNav'

defineProps<{
  fullPath: string
  repoName: string
  pathPrefix: string
  runningPipelines: number
  runningDotClass: string
  count: number
  hasMore: boolean
  isLoading: boolean
}>()
defineEmits<{ 'new-issue': [] }>()

const { onTabNav } = useTabNav()
</script>

<template>
  <!-- Header -->
  <div class="flex items-end justify-between gap-4">
    <div class="min-w-0">
      <p
        class="eyebrow-tick font-mono text-micro font-semibold tracking-[0.28em] text-muted-foreground/80 uppercase"
      >
        Issues
      </p>
      <!-- The title doubles as the way back. With the app masthead gone this is
           the only route up to the project picker, so the project name itself is
           the link — the arrow takes the lead position and slides on hover, the
           same affordance the detail view uses to step back to this list. The
           view-transition name stays on the <h1> so the picker→issues morph
           still lands on the title text. -->
      <RouterLink
        :to="{ name: 'projects' }"
        data-testid="back-to-projects"
        class="group/back -ml-1 mt-2 flex max-w-full items-center gap-2 rounded-md px-1 outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring/50"
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
      <Button variant="outline" data-testid="view-merge-requests" as-child>
        <RouterLink
          :to="{ name: 'merge-requests', params: { fullPath } }"
          @click="onTabNav($event, { name: 'merge-requests', params: { fullPath } })"
        >
          <GitMerge />
          Merge Requests
        </RouterLink>
      </Button>
      <Button variant="outline" data-testid="view-pipelines" as-child>
        <RouterLink
          :to="{ name: 'pipelines', params: { fullPath } }"
          @click="onTabNav($event, { name: 'pipelines', params: { fullPath } })"
        >
          <Workflow />
          Pipelines
          <!-- Live CI tell: a pulsing sky dot + count when pipelines are
               running right now, so the button reads as "something's cooking"
               before you click through. Hidden entirely when nothing runs. -->
          <span
            v-if="runningPipelines > 0"
            data-testid="pipelines-running"
            class="-mr-0.5 inline-flex items-center gap-1.5 font-mono text-xs font-medium tabular-nums text-sky-300"
            :title="`${runningPipelines} active`"
          >
            <span class="size-2 shrink-0 rounded-full animate-pulse" :class="runningDotClass" />
            {{ runningPipelines }}
          </span>
        </RouterLink>
      </Button>
      <Button data-testid="new-issue" @click="$emit('new-issue')">
        <Plus />
        New issue
      </Button>
      <div
        class="hidden shrink-0 flex-col items-end transition-opacity sm:flex"
        :class="isLoading ? 'opacity-0' : 'opacity-100'"
      >
        <span
          class="inline-flex items-baseline font-mono text-hero font-semibold tabular-nums text-foreground"
        >
          <Odometer :value="count" />
          <span class="text-primary" v-if="hasMore">+</span>
        </span>
        <span
          class="mt-2 font-mono text-micro font-medium tracking-[0.22em] text-muted-foreground/70 uppercase"
        >
          {{ count === 1 ? 'issue' : 'issues' }}
        </span>
      </div>
    </div>
  </div>
</template>
