<script setup lang="ts">
import { SquareArrowOutUpRight, X } from '@lucide/vue'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/shared/ui/sheet'
import { Button } from '@/shared/ui/button'
import IssueDetail from '@/views/IssueDetail.vue'

defineProps<{ open: boolean; fullPath: string; iid: string | null }>()
const emit = defineEmits<{
  'update:open': [value: boolean]
  expand: []
  'update:dirty': [value: boolean]
}>()
</script>

<template>
  <Sheet :open="open" @update:open="emit('update:open', $event)">
    <!-- The sheet rides in the same rounded card panel the shell uses: a thin
         background frame (p-1.5) around a bg-card panel, floating over the dimmed
         window rather than sitting flush to its edge. -->
    <SheetContent
      side="right"
      hide-close
      class="w-full gap-0 border-0 bg-background p-1.5 sm:max-w-2xl"
    >
      <div
        class="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-border/60 bg-card"
      >
        <!-- hide-close suppresses the sheet's viewport-corner X so the close and
             expand affordances live together inside the card header. -->
        <SheetHeader class="flex-row items-center gap-1 border-b border-border/60 px-4 py-3">
          <SheetTitle class="font-mono text-sm font-medium tabular-nums text-foreground">
            #{{ iid ?? '' }}
          </SheetTitle>
          <SheetDescription class="sr-only">Issue details</SheetDescription>
          <Button
            variant="ghost"
            size="icon-sm"
            class="ml-auto text-muted-foreground"
            aria-label="Expand to full page"
            @click="emit('expand')"
          >
            <SquareArrowOutUpRight />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            class="text-muted-foreground"
            aria-label="Close"
            @click="emit('update:open', false)"
          >
            <X />
          </Button>
        </SheetHeader>
        <!-- No bottom padding: the save bar (sticky bottom-0 inside IssueDetail) must
             pin flush to the panel edge. Any pb here leaves a strip below the bar where
             scrolling content peeks through. The article's own pb-20 handles spacing. -->
        <div class="min-h-0 flex-1 overflow-y-auto px-4 pt-4">
          <IssueDetail
            v-if="iid"
            :key="iid"
            :full-path="fullPath"
            :iid="iid"
            embedded
            @update:dirty="emit('update:dirty', $event)"
          />
        </div>
      </div>
    </SheetContent>
  </Sheet>
</template>
