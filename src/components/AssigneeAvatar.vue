<script setup lang="ts">
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

// GitLab avatars need a live web session to load (the PAT 401s on the avatar
// route), so always show initials instead of attempting the image.
defineProps<{ username: string; avatarUrl?: string | null }>();
</script>

<template>
  <span
    class="inline-flex items-center gap-1.5 text-xs text-muted-foreground"
    :title="username"
  >
    <Avatar class="size-5">
      <AvatarFallback class="text-[0.6rem]">{{
        username.slice(0, 2).toUpperCase()
      }}</AvatarFallback>
    </Avatar>
    <span>@{{ username }}</span>
  </span>
</template>
