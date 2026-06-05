<script setup lang="ts">
import { computed } from 'vue'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'

// GitLab avatars need a live web session to load (the PAT 401s on the avatar
// route), so always show initials instead of attempting the image.
const props = defineProps<{
  name: string
  username: string
  avatarUrl?: string | null
  // Avatar only (initials in the circle); the name still rides the title tooltip.
  // Used in dense rows where the spelled-out name would crowd the line.
  compact?: boolean
}>()

const initials = computed(() => {
  const parts = props.name.split(/[\s.-]+/)
  return parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : props.name.slice(0, 2)
})
</script>

<template>
  <span class="inline-flex items-center gap-1.5 text-xs text-muted-foreground" :title="username">
    <Avatar class="size-5">
      <AvatarFallback>
        {{ initials.toUpperCase() }}
      </AvatarFallback>
    </Avatar>
    <span v-if="!compact">{{ name }}</span>
  </span>
</template>
