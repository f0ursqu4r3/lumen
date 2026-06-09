<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()

// Phase 1: global views only. Later phases add project (breadcrumb + tabs) and
// detail (back + breadcrumb) branches keyed on route.params.fullPath.
const GLOBAL_TITLES: Record<string, string> = {
  home: 'My Work',
  projects: 'Projects',
}
const title = computed(() => GLOBAL_TITLES[String(route.name ?? '')] ?? '')
</script>

<template>
  <header class="flex h-12 shrink-0 items-center gap-3 border-b border-border bg-card/40 px-4">
    <h1 class="text-sm font-semibold text-foreground">{{ title }}</h1>
    <!-- Views teleport their context affordances (search, primary action) here. -->
    <div id="app-topbar-slot" class="ml-auto flex items-center gap-2" />
  </header>
</template>
