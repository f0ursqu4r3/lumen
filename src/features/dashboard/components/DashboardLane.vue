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

    <div
      v-if="isLoading"
      data-testid="lane-skeleton"
      class="divide-y divide-border/60 overflow-hidden rounded-xl border border-border bg-card shadow-card"
    >
      <div v-for="n in 3" :key="n" class="h-12 animate-pulse bg-muted/40" />
    </div>

    <ErrorNotice v-else-if="error" :error="error" />

    <p
      v-else-if="isEmpty"
      class="rounded-xl border border-dashed border-border px-4 py-6 text-sm text-muted-foreground"
    >
      {{ emptyMessage }}
    </p>

    <ul
      v-else
      class="divide-y divide-border/60 overflow-hidden rounded-xl border border-border bg-card shadow-card"
    >
      <slot />
    </ul>
  </section>
</template>
