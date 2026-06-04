<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  DialogRoot,
  DialogPortal,
  DialogOverlay,
  DialogContent,
  DialogClose,
  DialogTitle,
  DialogDescription,
  VisuallyHidden,
} from 'reka-ui'
import { onKeyStroke } from '@vueuse/core'
import { Captions, MessageCircle, ChevronLeft, ChevronRight, X, Film } from '@lucide/vue'
import type { ViewerItem } from '@/composables/useIssueMedia'

const props = defineProps<{ items: ViewerItem[]; startIndex?: number }>()
const open = defineModel<boolean>('open', { default: false })

const index = ref(0)

function clamp(i: number) {
  const n = props.items.length
  if (n === 0) return 0
  return Math.min(Math.max(i, 0), n - 1)
}

// Re-anchor to startIndex each time the viewer opens.
watch(
  open,
  (isOpen) => {
    if (isOpen) index.value = clamp(props.startIndex ?? 0)
  },
  { immediate: true },
)

// Keep index valid if the collection shrinks while the viewer is open.
watch(
  () => props.items.length,
  () => {
    index.value = clamp(index.value)
  },
)

const current = computed<ViewerItem | undefined>(() => props.items[index.value])
const hasMany = computed(() => props.items.length > 1)

function go(delta: number) {
  index.value = clamp(index.value + delta)
}

// While a <video> is focused, let its native controls own ←/→ (seek) instead.
function navKey(e: KeyboardEvent, delta: number) {
  if (!open.value) return
  if (document.activeElement instanceof HTMLVideoElement) return
  e.preventDefault()
  go(delta)
}
onKeyStroke('ArrowLeft', (e) => navKey(e, -1))
onKeyStroke('ArrowRight', (e) => navKey(e, 1))
</script>

<template>
  <DialogRoot v-model:open="open">
    <DialogPortal>
      <DialogOverlay
        class="fixed inset-0 z-50 bg-black/80 data-[state=open]:animate-in data-[state=open]:fade-in-0"
      />
      <DialogContent
        data-testid="media-viewer"
        class="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 p-6 focus:outline-none"
        @click.self="open = false"
      >
        <VisuallyHidden>
          <DialogTitle>Media viewer</DialogTitle>
          <DialogDescription
            >Fullscreen viewer for images and videos in this issue.</DialogDescription
          >
        </VisuallyHidden>

        <DialogClose
          class="absolute right-4 top-4 rounded-md p-1.5 text-white/70 transition-colors hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
          aria-label="Close"
        >
          <X class="size-5" />
        </DialogClose>

        <!-- Stage. Clicking the empty backdrop around the media closes the viewer. -->
        <div
          class="flex min-h-0 w-full flex-1 items-center justify-center gap-4"
          @click.self="open = false"
        >
          <button
            v-if="hasMany"
            type="button"
            class="shrink-0 rounded-full p-2 text-white/70 transition-colors hover:text-white disabled:opacity-30"
            aria-label="Previous"
            :disabled="index === 0"
            @click="go(-1)"
          >
            <ChevronLeft class="size-7" />
          </button>

          <div
            class="flex min-h-0 min-w-0 flex-1 items-center justify-center"
            @click.self="open = false"
          >
            <img
              v-if="current?.kind === 'image'"
              :src="current.src"
              :alt="current.alt"
              class="max-h-full max-w-full object-contain"
            />
            <video
              v-else-if="current?.kind === 'video'"
              :key="current.src"
              :src="current.src"
              controls
              class="max-h-full max-w-full object-contain"
            />
          </div>

          <button
            v-if="hasMany"
            type="button"
            class="shrink-0 rounded-full p-2 text-white/70 transition-colors hover:text-white disabled:opacity-30"
            aria-label="Next"
            :disabled="index === items.length - 1"
            @click="go(1)"
          >
            <ChevronRight class="size-7" />
          </button>
        </div>

        <!-- Caption + source + counter -->
        <div
          v-if="current"
          :data-media-source="current.source"
          class="flex max-w-full items-center gap-2 text-sm text-white/80"
        >
          <component
            :is="current.source === 'description' ? Captions : MessageCircle"
            class="size-4 shrink-0"
          />
          <span v-if="current.caption" class="truncate">{{ current.caption }}</span>
          <span class="ml-2 shrink-0 font-mono text-xs text-white/50" data-testid="media-counter">
            {{ index + 1 }} / {{ items.length }}
          </span>
        </div>

        <!-- Thumbnails -->
        <div v-if="hasMany" class="flex max-w-full gap-2 overflow-x-auto px-2 pb-1">
          <button
            v-for="(item, i) in items"
            :key="i"
            type="button"
            class="relative size-14 shrink-0 overflow-hidden rounded border-2 transition"
            :class="
              i === index ? 'border-white' : 'border-transparent opacity-60 hover:opacity-100'
            "
            :aria-label="`Media ${i + 1}`"
            :aria-current="i === index ? 'true' : undefined"
            @click="index = i"
          >
            <img
              v-if="item.kind === 'image'"
              :src="item.src"
              :alt="item.alt"
              class="size-full object-cover"
            />
            <span v-else class="grid size-full place-items-center bg-white/10 text-white/70">
              <Film class="size-5" />
            </span>
          </button>
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
