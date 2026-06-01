<script setup lang="ts">
import { computed } from 'vue'
import { Badge } from '@/components/ui/badge'

const props = defineProps<{ state: string }>()
const open = computed(() => props.state === 'opened')
</script>

<template>
  <!-- Badge has no "success" variant; use outline + explicit colors for open/closed. -->
  <Badge
    variant="outline"
    :class="
      open
        ? 'border-transparent bg-green-600 text-white'
        : 'border-transparent bg-neutral-200 text-neutral-700'
    "
  >
    {{ open ? 'Open' : 'Closed' }}
  </Badge>
</template>
