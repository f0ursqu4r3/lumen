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
const { repoName, pathPrefix } = useRepoPath(fullPath)

const GLOBAL_TITLES: Record<string, string> = { home: 'My Work', projects: 'Projects' }
const globalTitle = computed(() => GLOBAL_TITLES[name.value] ?? '')
</script>

<template>
  <header class="flex h-12 shrink-0 items-center gap-3 border-b border-border bg-card/40 px-4">
    <template v-if="projectTab">
      <span v-if="pathPrefix" class="truncate font-mono text-xs text-muted-foreground/70">
        {{ pathPrefix }}/
      </span>
      <span class="truncate text-sm font-semibold text-foreground">{{ repoName }}</span>
      <ProjectTabNav :full-path="fullPath" :active="projectTab" class="ml-1" />
    </template>

    <template v-else-if="detail">
      <RouterLink
        :to="{ name: detail.list, params: { fullPath } }"
        class="group/back flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft class="size-4 transition-transform group-hover/back:-translate-x-0.5" />
        <span class="truncate font-medium">{{ repoName }}</span>
      </RouterLink>
      <span class="font-mono text-xs tabular-nums text-muted-foreground/80">
        {{ detail.sigil }}{{ iid }}
      </span>
    </template>

    <h1 v-else class="text-sm font-semibold text-foreground">{{ globalTitle }}</h1>

    <!-- Views teleport their context affordances here. -->
    <div id="app-topbar-slot" class="ml-auto flex items-center gap-2" />
  </header>
</template>
