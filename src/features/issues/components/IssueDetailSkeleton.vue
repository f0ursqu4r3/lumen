<script setup lang="ts">
import { Skeleton } from '@/shared/ui/skeleton'
</script>

<template>
  <div class="issue" role="status" aria-busy="true">
    <span class="sr-only">Loading issue…</span>
    <header>
      <div class="flex items-center gap-2.5">
        <Skeleton class="h-5 w-16 rounded-[3px]" />
        <Skeleton class="h-4 w-10" />
        <Skeleton class="ml-auto h-8 w-24 rounded-md" />
      </div>
      <Skeleton class="mt-4 h-3 w-48" />
    </header>

    <div class="issue__body mt-8">
      <section class="issue__desc min-w-0 space-y-2.5">
        <Skeleton class="mb-6 h-8 w-3/4" />
        <Skeleton class="h-2.5 w-20" />
        <Skeleton class="h-3.5 w-full" />
        <Skeleton class="h-3.5 w-[92%]" />
        <Skeleton class="h-3.5 w-[78%]" />
        <Skeleton class="h-3.5 w-[85%]" />
      </section>

      <aside class="issue__meta space-y-6">
        <div class="space-y-2">
          <Skeleton class="h-2.5 w-14" />
          <Skeleton class="h-6 w-24 rounded-md" />
        </div>
        <div class="space-y-2">
          <Skeleton class="h-2.5 w-20" />
          <Skeleton class="h-6 w-28 rounded-md" />
        </div>
        <div class="space-y-1.5">
          <Skeleton class="h-2.5 w-16" />
          <Skeleton class="h-4 w-20" />
        </div>
      </aside>

      <section class="issue__talk min-w-0 space-y-4">
        <Skeleton class="h-2.5 w-20" />
        <div class="flex gap-3">
          <Skeleton class="size-7 shrink-0 rounded-full" />
          <div class="flex-1 space-y-2">
            <Skeleton class="h-3 w-32" />
            <Skeleton class="h-3.5 w-full" />
            <Skeleton class="h-3.5 w-2/3" />
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.issue {
  container-type: inline-size;
}

.issue__body {
  display: grid;
  gap: 2rem;
}

.issue__meta {
  position: relative;
  z-index: 1;
}

@container (min-width: 48rem) {
  .issue__body {
    grid-template-columns: minmax(0, 1fr) 15rem;
    column-gap: 3rem;
    row-gap: 2.5rem;
    align-items: start;
    grid-template-areas:
      'desc meta'
      'talk meta'
      'pad  meta';
  }
  .issue__desc {
    grid-area: desc;
  }
  .issue__meta {
    grid-area: meta;
    border: 0;
    border-radius: 0;
    background: transparent;
    box-shadow: none;
    padding: 0;
  }
  .issue__talk {
    grid-area: talk;
  }
  .issue__pad {
    grid-area: pad;
  }
}
</style>
