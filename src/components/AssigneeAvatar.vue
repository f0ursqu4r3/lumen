<script setup lang="ts">
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'

defineProps<{ username: string; avatarUrl?: string | null }>()
</script>

<template>
  <span class="inline-flex items-center gap-1.5 text-xs text-muted-foreground" :title="username">
    <Avatar class="size-5">
      <AvatarImage v-if="avatarUrl" :src="avatarUrl" :alt="username" />
      <AvatarFallback class="text-[0.6rem]">{{ username.slice(0, 2).toUpperCase() }}</AvatarFallback>
    </Avatar>
    <span>@{{ username }}</span>
  </span>
</template>
