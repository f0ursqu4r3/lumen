<script setup lang="ts">
import { SquareArrowOutUpRight } from '@lucide/vue'
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
    <SheetContent side="right" class="w-full gap-0 p-0 sm:max-w-2xl">
      <SheetHeader class="flex-row items-center gap-2 border-b px-4 py-3">
        <SheetTitle class="text-sm">#{{ iid ?? '' }}</SheetTitle>
        <SheetDescription class="sr-only">Issue details</SheetDescription>
        <!-- mr-6 keeps the expand button clear of SheetContent's absolute close (X) -->
        <Button
          variant="ghost"
          size="icon-sm"
          class="ml-auto mr-6"
          aria-label="Expand to full page"
          @click="emit('expand')"
        >
          <SquareArrowOutUpRight />
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
    </SheetContent>
  </Sheet>
</template>
