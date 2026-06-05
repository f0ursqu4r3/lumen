<script setup lang="ts">
import type { Component } from 'vue'
import { X, CircleCheck, CircleX, Info } from '@lucide/vue'
import { toasts, dismissToast, type Toast, type ToastTone } from '@/composables/useToast'
import { rpc } from '@/lib/rpc'

// One mounted instance (in App.vue, beside ConfirmDialog) renders the shared
// toast queue. Stacks bottom-right; each toast is a focal card (shadow-pop),
// click-through gaps via pointer-events. Solid surface — no glassmorphism.
const TONE: Record<ToastTone, { icon: Component; text: string }> = {
  success: { icon: CircleCheck, text: 'text-emerald-300' },
  failed: { icon: CircleX, text: 'text-red-300' },
  info: { icon: Info, text: 'text-muted-foreground' },
}

function activate(t: Toast) {
  if (t.href) void rpc.openExternal({ url: t.href })
  dismissToast(t.id)
}
</script>

<template>
  <TransitionGroup
    tag="div"
    class="pointer-events-none fixed right-4 bottom-4 z-50 flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2"
    enter-from-class="translate-y-2 opacity-0"
    enter-active-class="ease-[cubic-bezier(0.22,1,0.36,1)] motion-safe:transition motion-safe:duration-300"
    enter-to-class="translate-y-0 opacity-100"
    leave-from-class="opacity-100"
    leave-active-class="absolute right-0 left-0 ease-out motion-safe:transition motion-safe:duration-200"
    leave-to-class="translate-y-1 opacity-0"
  >
    <div
      v-for="t in toasts"
      :key="t.id"
      class="pointer-events-auto flex items-start gap-2.5 rounded-xl border border-border bg-card p-3 shadow-pop"
      role="status"
      aria-live="polite"
    >
      <component
        :is="TONE[t.tone ?? 'info'].icon"
        class="mt-px size-4 shrink-0"
        :class="TONE[t.tone ?? 'info'].text"
      />
      <component
        :is="t.href ? 'button' : 'div'"
        :type="t.href ? 'button' : undefined"
        class="min-w-0 flex-1 text-left outline-none"
        :class="t.href ? 'cursor-pointer' : ''"
        @click="t.href && activate(t)"
      >
        <p class="text-sm font-medium text-foreground">{{ t.title }}</p>
        <p v-if="t.description" class="mt-0.5 truncate text-xs text-muted-foreground">
          {{ t.description }}
        </p>
      </component>
      <button
        class="-mt-1 -mr-1 shrink-0 rounded-md p-1 text-muted-foreground/60 outline-none hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring/50"
        :aria-label="`Dismiss: ${t.title}`"
        @click="dismissToast(t.id)"
      >
        <X class="size-3.5" />
      </button>
    </div>
  </TransitionGroup>
</template>
