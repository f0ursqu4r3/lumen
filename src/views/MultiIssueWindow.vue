<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useTitle, onKeyStroke } from '@vueuse/core'
import { ChevronLeft, ChevronRight } from '@lucide/vue'
import IssueDetail from '@/views/IssueDetail.vue'
import { useConfirm } from '@/shared/composables/useConfirm'

// `windowed` is accepted for parity with the route's prop shape (the URL carries
// ?window=1) but isn't read here: this view is always a native window, so
// IssueDetail is rendered :windowed (condensed title) and :embedded (no chrome).
const props = defineProps<{ fullPath: string; iids: string[]; windowed?: boolean }>()

const index = ref(0)
const total = computed(() => props.iids.length)
const current = computed<string | null>(() => props.iids[index.value] ?? null)

// Pin IssueDetail's condensed title bar just below our own sticky pager header —
// measure the header so the offset tracks its real height.
const headerEl = ref<HTMLElement | null>(null)
const stickyTop = ref(0)
onMounted(() => {
  if (headerEl.value) stickyTop.value = headerEl.value.offsetHeight
})

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

// Pager buttons are segments in one pill — the same idiom as the list toolbar's
// view toggle: borderless tiles inside a bordered, muted track.
const navBtn =
  'grid size-7 place-items-center rounded-[7px] text-muted-foreground transition-colors duration-150 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60 active:scale-[0.97] disabled:opacity-40 disabled:hover:text-muted-foreground'
</script>

<template>
  <div v-if="total === 0" class="grid place-items-center py-24 text-sm text-muted-foreground">
    No issues.
  </div>
  <div v-else>
    <!-- Full-bleed bar: mx-[calc(50%-50vw)] breaks out of the app shell's
         centered max-width to span the whole window at any width; -mt-6 pulls it
         up under the title bar. The inner row re-creates the centered, padded
         content column so the controls align with the issue content below. -->
    <header
      ref="headerEl"
      class="sticky top-0 z-10 mx-[calc(50%-50vw)] -mt-6 mb-2 border-b border-border/60 bg-background/95 py-2 backdrop-blur-sm"
    >
      <div class="relative mx-auto flex min-h-7 max-w-5xl items-center justify-end gap-2 px-4">
        <span
          data-testid="pager-position"
          class="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 font-mono text-sm font-medium tabular-nums text-foreground"
        >
          {{ index + 1 }} of {{ total }}
        </span>
        <div
          role="group"
          aria-label="Page through issues"
          class="inline-flex rounded-lg border border-border bg-muted/40 p-0.5"
        >
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
      </div>
    </header>

    <IssueDetail
      :key="current ?? ''"
      :full-path="fullPath"
      :iid="current ?? ''"
      embedded
      windowed
      :sticky-top="stickyTop"
      @update:dirty="dirty = $event"
    />
  </div>
</template>
