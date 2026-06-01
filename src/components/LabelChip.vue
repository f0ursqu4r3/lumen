<script setup lang="ts">
import { Badge } from '@/components/ui/badge'

defineProps<{ title: string; color: string }>()
</script>

<template>
  <!-- GitLab supplies an arbitrary hex color, so override the Badge background. -->
  <Badge :style="{ backgroundColor: color, borderColor: 'transparent', color: '#fff' }">
    {{ title }}
  </Badge>
</template>
