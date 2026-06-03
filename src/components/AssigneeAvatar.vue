<script setup lang="ts">
import { computed } from 'vue'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'

// GitLab avatars need a live web session to load (the PAT 401s on the avatar
// route), so always show initials instead of attempting the image.
const props = defineProps<{
  name: string
  username: string
  avatarUrl?: string | null
}>()

const initials = computed(() => {
  const parts = props.name.split(/[\s.-]+/)
  return parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : props.name.slice(0, 2)
})
</script>

<template>
  <span class="inline-flex items-center gap-1.5 text-xs text-muted-foreground" :title="username">
    <Avatar class="size-5">
      <AvatarFallback class="text-[0.6rem]">
        {{ initials.toUpperCase() }}
      </AvatarFallback>
    </Avatar>
    <span>{{ name }}</span>
  </span>
</template>
