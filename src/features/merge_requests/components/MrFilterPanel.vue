<script setup lang="ts">
// Label filtering is fully wired in the data layer (useMrFilters.labels →
// labelName) and round-trips through the URL + saved views, but has no UI
// surface yet. TODO(v1.1): add a label flyout here, reusing the issues' labels
// picker, mirroring how the issue filter panel grew.
import type { MrDraft, MrState } from '@/features/merge_requests/lib/mrView'
import { Input } from '@/shared/ui/input'

const state = defineModel<MrState>('state', { required: true })
const draft = defineModel<MrDraft>('draft', { required: true })
const author = defineModel<string>('author', { required: true })
const assignee = defineModel<string>('assignee', { required: true })
const reviewer = defineModel<string>('reviewer', { required: true })
const milestone = defineModel<string>('milestone', { required: true })
</script>

<template>
  <div class="flex flex-wrap items-center gap-2">
    <select
      v-model="state"
      aria-label="State"
      class="rounded-md border border-border bg-background px-2 py-1 text-sm"
    >
      <option value="opened">Open</option>
      <option value="merged">Merged</option>
      <option value="closed">Closed</option>
      <option value="all">All</option>
    </select>
    <select
      v-model="draft"
      aria-label="Draft"
      class="rounded-md border border-border bg-background px-2 py-1 text-sm"
    >
      <option value="any">Any</option>
      <option value="draft">Draft</option>
      <option value="ready">Ready</option>
    </select>
    <Input v-model="author" placeholder="author" aria-label="Author username" class="h-8 w-32" />
    <Input
      v-model="assignee"
      placeholder="assignee"
      aria-label="Assignee username"
      class="h-8 w-32"
    />
    <Input
      v-model="reviewer"
      placeholder="reviewer"
      aria-label="Reviewer username"
      class="h-8 w-32"
    />
    <Input
      v-model="milestone"
      placeholder="milestone"
      aria-label="Milestone title"
      class="h-8 w-32"
    />
  </div>
</template>
