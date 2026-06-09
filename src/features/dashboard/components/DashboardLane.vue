<script setup lang="ts">
import ErrorNotice from '@/shared/components/ErrorNotice.vue'
import type { GitLabError } from '@/gitlab/errors'

defineProps<{
  title: string
  count: number
  isLoading: boolean
  error: GitLabError | null
  isEmpty: boolean
  emptyMessage: string
  hasMore?: boolean
}>()
</script>

<template>
  <section>
    <header class="mb-2 flex items-baseline gap-2">
      <h2 class="text-sm font-semibold tracking-wide text-foreground">{{ title }}</h2>
      <span class="font-mono text-xs tabular-nums text-muted-foreground/70">
        {{ count }}<span v-if="hasMore" class="text-primary">+</span>
      </span>
    </header>

    <div v-if="isLoading" data-testid="lane-skeleton" class="space-y-1.5">
      <div v-for="n in 3" :key="n" class="h-11 animate-pulse rounded-md bg-muted/50" />
    </div>

    <ErrorNotice v-else-if="error" :error="error" />

    <p v-else-if="isEmpty" class="px-3 py-6 text-sm text-muted-foreground">{{ emptyMessage }}</p>

    <ul v-else class="divide-y divide-border/40">
      <slot />
    </ul>
  </section>
</template>
