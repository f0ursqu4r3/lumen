<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { useTitle, onKeyStroke, useSessionStorage } from '@vueuse/core'
import { ChevronLeft, ChevronRight } from '@lucide/vue'
import IssueDetail from '@/views/IssueDetail.vue'
import { useConfirm } from '@/shared/composables/useConfirm'

// `windowed` is accepted for parity with the route's prop shape (the URL carries
// ?window=1) but isn't read here: this view is always a native window, so
// IssueDetail is rendered :windowed (condensed title) and :embedded (no chrome).
const props = defineProps<{ fullPath: string; iids: string[]; windowed?: boolean }>()

// Remember which issue was open so a page refresh (mostly: HMR reloads) restores
// it instead of snapping back to the first. We persist the *iid* — robust to the
// list being reordered — keyed by this window's identity (repo + its iid set), so
// distinct multi-issue windows don't clobber each other. sessionStorage is the
// right scope: it survives reload but is per-window and dies with the window.
const storageKey = `miw:iid:${props.fullPath}|${props.iids.join(',')}`
const lastIid = useSessionStorage<string | null>(storageKey, null)

const restored = props.iids.indexOf(lastIid.value ?? '')
const index = ref(restored >= 0 ? restored : 0)
const total = computed(() => props.iids.length)
const current = computed<string | null>(() => props.iids[index.value] ?? null)

watch(current, (iid) => {
  lastIid.value = iid
})

// Pin IssueDetail's condensed title bar just below our own fixed pager header.
// The header sits inside the framed panel, so measure its viewport-relative
// bottom (not bare height) — the condensed bar is `fixed`, so it needs the real
// y to land flush under the pager.
const headerEl = ref<HTMLElement | null>(null)
const stickyTop = ref(0)
onMounted(() => {
  if (headerEl.value) stickyTop.value = Math.round(headerEl.value.getBoundingClientRect().bottom)
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
  'grid size-7 place-items-center rounded-md text-muted-foreground transition-colors duration-150 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60 active:scale-[0.97] disabled:opacity-40 disabled:hover:text-muted-foreground'
</script>

<template>
  <div v-if="total === 0" class="grid h-full place-items-center text-sm text-muted-foreground">
    No issues.
  </div>
  <div v-else class="flex h-full min-h-0 flex-col">
    <!-- Pager bar: a fixed (flex-none) header hugging the panel top; the issue
         content scrolls in the region below it, so the window never scrolls. -->
    <header ref="headerEl" class="flex-none border-b border-border/60 bg-card">
      <div class="relative mx-auto flex min-h-7 max-w-5xl items-center justify-end gap-2 px-4 py-2">
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

    <div class="min-h-0 flex-1 overflow-y-auto overflow-x-clip">
      <main class="mx-auto max-w-5xl px-4 py-6">
        <IssueDetail
          :key="current ?? ''"
          :full-path="fullPath"
          :iid="current ?? ''"
          embedded
          windowed
          :sticky-top="stickyTop"
          @update:dirty="dirty = $event"
        />
      </main>
    </div>
  </div>
</template>
