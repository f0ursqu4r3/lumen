<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { ArrowLeft } from '@lucide/vue'
import { useRepoPath } from '@/shared/composables/useRepoPath'
import ProjectTabNav from './ProjectTabNav.vue'

const route = useRoute()

const PROJECT_LIST_ROUTES = ['issues', 'merge-requests', 'pipelines'] as const
// Each detail route maps to the parent list route + the ref sigil.
const DETAIL_ROUTES: Record<string, { list: string; sigil: string }> = {
  issue: { list: 'issues', sigil: '#' },
  'merge-request': { list: 'merge-requests', sigil: '!' },
}

const fullPath = computed(() => {
  const raw = route.params.fullPath
  return typeof raw === 'string' ? raw : ''
})
const name = computed(() => String(route.name ?? ''))
const iid = computed(() => {
  const raw = route.params.iid
  return typeof raw === 'string' ? raw : ''
})

const projectTab = computed(() =>
  fullPath.value && (PROJECT_LIST_ROUTES as readonly string[]).includes(name.value)
    ? name.value
    : null,
)
const detail = computed(() => (fullPath.value ? (DETAIL_ROUTES[name.value] ?? null) : null))
const { repoName } = useRepoPath(fullPath)

const GLOBAL_TITLES: Record<string, string> = { home: 'My Work', projects: 'Projects' }
const globalTitle = computed(() => GLOBAL_TITLES[name.value] ?? '')
</script>

<template>
  <header class="relative flex h-12 shrink-0 items-center gap-3 border-b border-border/60 px-4">
    <template v-if="projectTab">
      <span class="truncate text-sm font-medium text-foreground" :title="fullPath">
        {{ repoName }}
      </span>
      <ProjectTabNav :full-path="fullPath" :active="projectTab" class="ml-1.5" />
    </template>

    <!-- Detail is a focused, single-item view — its crumb is centered over the
         (centered) content column; the teleported actions stay pinned right. -->
    <div v-else-if="detail" class="pointer-events-none absolute inset-x-16 flex justify-center">
      <RouterLink
        :to="{ name: detail.list, params: { fullPath } }"
        :title="`Back to ${fullPath}`"
        class="group/crumb pointer-events-auto flex min-w-0 items-center gap-1.5 text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft
          class="size-4 shrink-0 text-primary transition-transform group-hover/crumb:-translate-x-0.5"
        />
        <span class="truncate text-sm font-medium text-foreground">{{ repoName }}</span>
        <span class="shrink-0 font-mono text-2xs tabular-nums text-muted-foreground/60">
          {{ detail.sigil }}{{ iid }}
        </span>
      </RouterLink>
    </div>

    <h1 v-else class="text-sm font-medium text-foreground">{{ globalTitle }}</h1>

    <!-- Views teleport their context affordances here. -->
    <div id="app-topbar-slot" class="ml-auto flex items-center gap-2" />
  </header>
</template>
