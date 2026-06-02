<script setup lang="ts">
import { computed } from 'vue'
import { renderMarkdown } from '@/lib/markdown'

const props = defineProps<{ source?: string | null; projectPath?: string }>()
const html = computed(() => renderMarkdown(props.source, { projectPath: props.projectPath }))
</script>

<template>
  <!-- eslint-disable-next-line vue/no-v-html — sanitized in renderMarkdown -->
  <div class="markdown" v-html="html" />
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
.markdown :deep(img) {
  max-width: 100%;
}
</style>
