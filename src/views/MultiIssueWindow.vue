<script setup lang="ts">
import { ref, computed } from 'vue'
import { useTitle, onKeyStroke } from '@vueuse/core'
import { ChevronLeft, ChevronRight } from '@lucide/vue'
import IssueDetail from '@/views/IssueDetail.vue'
import { useConfirm } from '@/shared/composables/useConfirm'

// `windowed` is accepted for parity with the route's prop shape (the URL carries
// ?window=1) but isn't read: this window owns its chrome and always renders
// IssueDetail :embedded. Kept so the route's props mapping stays uniform.
const props = defineProps<{ fullPath: string; iids: string[]; windowed?: boolean }>()

const index = ref(0)
const total = computed(() => props.iids.length)
const current = computed<string | null>(() => props.iids[index.value] ?? null)

// IssueDetail is rendered with :embedded — that keeps its update:dirty emit (which
// the pager guard needs) while turning off its own title, route-leave guard, and
// back-arrow, so this window owns the chrome. We track the current page's dirty
// state to guard paging away from unsaved edits.
const dirty = ref(false)
const { confirm } = useConfirm()

const repoName = computed(() => props.fullPath.split('/').at(-1) ?? props.fullPath)
useTitle(
  computed(() =>
    total.value ? `${repoName.value} · ${index.value + 1} of ${total.value}` : 'lumen',
  ),
)

async function go(delta: number) {
  const nextIndex = index.value + delta
  if (nextIndex < 0 || nextIndex >= total.value) return
  if (dirty.value) {
    const ok = await confirm({
      title: 'Discard unsaved changes?',
      description: "Your edits to this issue haven't been saved.",
    })
    if (!ok) return
  }
  dirty.value = false
  index.value = nextIndex
}
const prev = () => go(-1)
const next = () => go(1)

// Arrow keys page, but never while typing in a field (mirrors IssueList's guard).
function typingInField(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null
  return !!t && (/^(INPUT|TEXTAREA)$/.test(t.tagName) || t.isContentEditable)
}
onKeyStroke('ArrowLeft', (e) => {
  if (!typingInField(e)) prev()
})
onKeyStroke('ArrowRight', (e) => {
  if (!typingInField(e)) next()
})

const navBtn =
  'grid size-7 place-items-center rounded-md border border-border text-muted-foreground transition-colors outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60 disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-muted-foreground'
</script>

<template>
  <div v-if="total === 0" class="grid place-items-center py-24 text-sm text-muted-foreground">
    No issues.
  </div>
  <div v-else>
    <header class="relative mb-5 flex items-center justify-end gap-3 border-b border-border pb-3">
      <span
        data-testid="pager-position"
        class="absolute left-1/2 -translate-x-1/2 min-w-20 text-center font-mono text-sm font-medium tabular-nums text-foreground"
      >
        {{ index + 1 }} of {{ total }}
      </span>
      <div class="flex gap-2">
        <button
          type="button"
          data-testid="pager-prev"
          aria-label="Previous issue"
          :class="navBtn"
          :disabled="index === 0"
          @click="prev"
        >
          <ChevronLeft class="size-4" />
        </button>
        <button
          type="button"
          data-testid="pager-next"
          aria-label="Next issue"
          :class="navBtn"
          :disabled="index >= total - 1"
          @click="next"
        >
          <ChevronRight class="size-4" />
        </button>
      </div>
    </header>

    <IssueDetail
      :key="current ?? ''"
      :full-path="fullPath"
      :iid="current ?? ''"
      embedded
      @update:dirty="dirty = $event"
    />
  </div>
</template>
