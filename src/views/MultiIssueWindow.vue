<script setup lang="ts">
import { ref, computed, toRef, watch } from 'vue'
import { useTitle, onKeyStroke } from '@vueuse/core'
import { ChevronLeft, ChevronRight } from '@lucide/vue'
import IssueDetail from '@/views/IssueDetail.vue'
import { useIssue } from '@/features/issues/composables/useIssue'
import { useConfirm } from '@/shared/composables/useConfirm'

// `windowed` is accepted for parity with the route's prop shape (the URL carries
// ?window=1) but isn't read: this window owns its chrome and always renders
// IssueDetail :embedded. Kept so the route's props mapping stays uniform.
const props = defineProps<{ fullPath: string; iids: string[]; windowed?: boolean }>()

const index = ref(0)
const total = computed(() => props.iids.length)
const current = computed<string | null>(() => props.iids[index.value] ?? null)

// The current issue's title for the condensed sticky header. Shares the cached
// query with the embedded IssueDetail (same key) — no extra fetch.
const currentIid = computed(() => current.value ?? '')
const { data: currentIssue } = useIssue(toRef(props, 'fullPath'), currentIid)
const currentTitle = computed(() => currentIssue.value?.title ?? '')

// IssueDetail reports when its title scrolls under our sticky header; we then
// reveal the condensed title. Each page starts at the top (title in view), and
// IssueDetail remounts per page, so reset on a page turn.
const titleVisible = ref(true)
watch(current, () => (titleVisible.value = true))

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
    <!-- Full-bleed bar: -mx-4 cancels the app shell's px-4 so the rule spans the
         whole window; -mt-6 pulls it up under the title bar. Controls re-pad with
         px-4 to stay aligned with the issue content below. -->
    <header
      class="sticky top-0 z-10 -mx-4 -mt-6 mb-2 border-b border-border bg-background/95 px-4 py-2 backdrop-blur-sm"
    >
      <div class="relative flex min-h-7 items-center justify-end gap-2">
        <!-- Condensed title: fades in once the main title scrolls under the bar. -->
        <span
          data-testid="condensed-title"
          aria-hidden="true"
          class="pointer-events-none absolute left-0 max-w-[45%] truncate text-sm font-medium text-foreground/90 transition-opacity duration-200"
          :class="titleVisible ? 'opacity-0' : 'opacity-100'"
        >
          {{ currentTitle }}
        </span>
        <span
          data-testid="pager-position"
          class="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 font-mono text-sm font-medium tabular-nums text-foreground"
        >
          {{ index + 1 }} of {{ total }}
        </span>
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
      @update:title-visible="titleVisible = $event"
    />
  </div>
</template>
