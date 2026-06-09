<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useRepoPath } from '@/shared/composables/useRepoPath'
import ProjectTabNav from './ProjectTabNav.vue'

const route = useRoute()

const PROJECT_LIST_ROUTES = ['issues', 'merge-requests', 'pipelines'] as const
const fullPath = computed(() => {
  const raw = route.params.fullPath
  return typeof raw === 'string' ? raw : ''
})
const projectTab = computed(() => {
  const name = String(route.name ?? '')
  return fullPath.value && (PROJECT_LIST_ROUTES as readonly string[]).includes(name) ? name : null
})
const { repoName, pathPrefix } = useRepoPath(fullPath)

const GLOBAL_TITLES: Record<string, string> = { home: 'My Work', projects: 'Projects' }
const globalTitle = computed(() => GLOBAL_TITLES[String(route.name ?? '')] ?? '')
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
    <h1 v-else class="text-sm font-semibold text-foreground">{{ globalTitle }}</h1>

    <!-- Views teleport their context affordances (primary action) here. -->
    <div id="app-topbar-slot" class="ml-auto flex items-center gap-2" />
  </header>
</template>
