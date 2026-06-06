<script setup lang="ts">
import IssueRow from '@/features/issues/components/IssueRow.vue'
import { Card } from '@/shared/ui/card'
import type { Facet, IssueGroup } from '@/features/issues/lib/issueView'

defineProps<{
  groups: IssueGroup[]
  groupKey: string
  fullPath: string
  highlightIid: string | null
  vtNameFor: (iid: string) => string | undefined
}>()
defineEmits<{ filter: [f: Facet] }>()
</script>

<template>
  <!-- List view -->
  <div class="space-y-5">
    <section v-for="g in groups" :key="g.key" class="space-y-2">
      <header v-if="groupKey !== 'none'" class="flex items-center gap-2 px-1">
        <span v-if="g.color" class="size-2 rounded-full" :style="{ backgroundColor: g.color }" />
        <h2 class="text-sm font-medium text-foreground">{{ g.label }}</h2>
        <span class="font-mono text-xs tabular-nums text-muted-foreground/60">
          {{ g.issues.length }}
        </span>
      </header>
      <Card class="gap-0 divide-y divide-border/60 overflow-hidden p-0 shadow-pop">
        <IssueRow
          v-for="(issue, i) in g.issues"
          :key="issue.iid"
          :issue="issue"
          :full-path="fullPath"
          :index="i"
          :highlight="issue.iid === highlightIid"
          :vt-name="vtNameFor(issue.iid)"
          @filter="$emit('filter', $event)"
        />
      </Card>
    </section>
  </div>
</template>
