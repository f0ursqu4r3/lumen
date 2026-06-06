<script setup lang="ts">
import { computed, ref, watch, nextTick } from 'vue'
import { renderMarkdown } from '@/shared/lib/markdown'
import { applyResolvedMedia } from '@/shared/lib/media'
import { resolveAsset } from '@/shared/composables/useGitlabAsset'
import { rpc } from '@/shared/lib/rpc'

const props = defineProps<{ source?: string | null; projectPath?: string }>()
const html = computed(() => renderMarkdown(props.source, { projectPath: props.projectPath }))
const host = ref<HTMLElement | null>(null)

// Links render via v-html, so intercept clicks by delegation. The native webview
// ignores <a target="_blank"> and otherwise navigates the app window itself, so
// absolute web links must round-trip through the host to reach the OS browser.
// We match on the raw href: only http(s):// links are external. Relative/internal
// links (served under the views:// origin) and file-card download anchors (which
// point at resolved asset paths) are left to navigate in place.
function onClick(e: MouseEvent) {
  const anchor = (e.target as HTMLElement | null)?.closest('a')
  if (!anchor || anchor.hasAttribute('download')) return
  const href = anchor.getAttribute('href') ?? ''
  if (!/^https?:\/\//i.test(href)) return
  e.preventDefault()
  void rpc.openExternal({ url: href })
}

// After each render, swap GitLab upload paths for blob URLs fetched via RPC.
watch(
  html,
  async () => {
    await nextTick()
    if (host.value) await applyResolvedMedia(host.value, resolveAsset)
  },
  { immediate: true },
)
</script>

<template>
  <!-- eslint-disable-next-line vue/no-v-html — sanitized in renderMarkdown -->
  <div ref="host" class="markdown" @click="onClick" v-html="html" />
</template>

<style scoped>
/* Preflight strips list/heading styling; restore the basics for rendered markdown. */
.markdown :deep(:first-child) {
  margin-top: 0;
}
.markdown :deep(:last-child) {
  margin-bottom: 0;
}
.markdown :deep(p) {
  margin: 0.5rem 0;
}
.markdown :deep(h1),
.markdown :deep(h2),
.markdown :deep(h3) {
  font-weight: 600;
  margin: 0.75rem 0 0.25rem;
}
.markdown :deep(h1) {
  font-size: 1.125rem;
}
.markdown :deep(h2) {
  font-size: 1rem;
}
.markdown :deep(ul) {
  list-style: disc;
  padding-left: 1.25rem;
  margin: 0.5rem 0;
}
.markdown :deep(ol) {
  list-style: decimal;
  padding-left: 1.25rem;
  margin: 0.5rem 0;
}
.markdown :deep(li) {
  margin: 0.125rem 0;
}
.markdown :deep(a) {
  color: var(--primary);
  text-decoration: underline;
}
.markdown :deep(code) {
  background: var(--muted);
  padding: 0.1rem 0.3rem;
  border-radius: 0.25rem;
  font-size: 0.85em;
}
.markdown :deep(pre) {
  background: var(--muted);
  padding: 0.75rem;
  border-radius: 0.5rem;
  overflow-x: auto;
  margin: 0.5rem 0;
}
.markdown :deep(pre code) {
  background: transparent;
  padding: 0;
}
.markdown :deep(blockquote) {
  border-left: 3px solid var(--border);
  padding-left: 0.75rem;
  color: var(--muted-foreground);
  margin: 0.5rem 0;
}
.markdown :deep(table) {
  border-collapse: collapse;
  margin: 0.5rem 0;
}
.markdown :deep(th),
.markdown :deep(td) {
  border: 1px solid var(--border);
  padding: 0.25rem 0.5rem;
}
.markdown :deep(img),
.markdown :deep(video),
.markdown :deep(audio) {
  max-width: 100%;
}
.markdown :deep(img[data-media-trigger]) {
  cursor: zoom-in;
}
/* Placeholder shown while a deferred upload resolves to a blob URL. The marker is
   removed in applyResolvedMedia() once the real src is set. */
.markdown :deep([data-media-loading]) {
  display: inline-block;
  max-width: 100%;
  border-radius: 0.5rem;
  background: var(--muted);
  animation: media-loading-pulse 1.4s ease-in-out infinite;
}
/* Reserve space only along axes the author didn't pin, so explicit
   {width=/height=} dimensions are never overridden. */
.markdown :deep([data-media-loading]:not([width])) {
  min-width: 12rem;
}
.markdown :deep([data-media-loading]:not([height])) {
  min-height: 9rem;
}
@keyframes media-loading-pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.55;
  }
}
@media (prefers-reduced-motion: reduce) {
  .markdown :deep([data-media-loading]) {
    animation: none;
  }
}
.markdown :deep(.media-frame) {
  position: relative;
  display: inline-block;
  max-width: 100%;
}
.markdown :deep(.media-expand) {
  position: absolute;
  top: 0.5rem;
  right: 0.5rem;
  display: grid;
  place-items: center;
  width: 1.75rem;
  height: 1.75rem;
  border-radius: 0.375rem;
  background: rgb(0 0 0 / 0.6);
  color: #fff;
  font-size: 0.9rem;
  line-height: 1;
  opacity: 0;
  transition: opacity 0.15s ease;
  cursor: pointer;
}
.markdown :deep(.media-frame:hover) .media-expand,
.markdown :deep(.media-frame:focus-within) .media-expand {
  opacity: 1;
}
.markdown :deep(.file-card) {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.4rem 0.7rem;
  border: 1px solid var(--border);
  border-radius: 0.5rem;
  background: var(--muted);
  color: var(--foreground);
  text-decoration: none;
  font-size: 0.85em;
}
.markdown :deep(.file-card:hover) {
  border-color: var(--primary);
}
</style>
