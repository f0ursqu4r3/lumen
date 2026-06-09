<script setup lang="ts">
import { computed, toRef } from 'vue'
import { ArrowLeft, ExternalLink } from '@lucide/vue'
import { useMergeRequest } from '@/features/merge_requests/composables/useMergeRequest'
import { sanitizeHtml } from '@/shared/lib/markdown'
import MrStateBadge from '@/features/merge_requests/components/MrStateBadge.vue'
import MergeRequestDetailRail from '@/features/merge_requests/components/MergeRequestDetailRail.vue'
import MrDiscussion from '@/features/merge_requests/components/MrDiscussion.vue'
import ErrorNotice from '@/shared/components/ErrorNotice.vue'

const props = defineProps<{ fullPath: string; iid: string }>()
const fullPath = toRef(props, 'fullPath')
const iid = toRef(props, 'iid')

const { data: mr, isLoading, error } = useMergeRequest(fullPath, iid)

// Each discussion is a thread: its first note is the comment, the rest replies.
// Drop system notes (GitLab models each as its own single-note discussion) and
// any thread left empty by that filter. The nested `nodes` are nullable, so guard
// at every hop.
const threads = computed(
  () =>
    mr.value?.discussions.nodes
      ?.filter((d): d is NonNullable<typeof d> => !!d)
      .map((d) => ({
        id: d.id,
        notes: (d.notes.nodes ?? []).filter((n): n is NonNullable<typeof n> => !!n && !n.system),
      }))
      .filter((t) => t.notes.length) ?? [],
)

// `descriptionHtml` is server-rendered, attacker-authored HTML. The issue view
// renders its description through MarkdownText → renderMarkdown (DOMPurify); we
// reuse that same DOMPurify allow-list via sanitizeHtml before v-html so both
// paths share one sanitization approach.
const descriptionHtml = computed(() => sanitizeHtml(mr.value?.descriptionHtml))
</script>

<template>
  <div class="mx-auto w-full max-w-5xl px-6 py-8">
    <ErrorNotice v-if="error" :error="error" />
    <div v-else-if="isLoading" class="text-sm text-muted-foreground">Loading…</div>

    <template v-else-if="mr">
      <RouterLink
        :to="{ name: 'merge-requests', params: { fullPath } }"
        class="group/back -ml-1 flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft class="size-4 transition-transform group-hover/back:-translate-x-0.5" />
        Merge requests
      </RouterLink>

      <div class="mt-3 flex items-start justify-between gap-4">
        <div class="min-w-0">
          <div class="flex items-center gap-2">
            <h1 class="text-title font-semibold text-foreground">{{ mr.title }}</h1>
            <MrStateBadge :state="mr.state" :draft="mr.draft" />
          </div>
          <p class="mt-1 font-mono text-xs text-muted-foreground">!{{ mr.iid }}</p>
        </div>
        <a
          :href="mr.webUrl"
          target="_blank"
          rel="noopener"
          class="inline-flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <ExternalLink class="size-3.5" /> Open in GitLab
        </a>
      </div>

      <div class="mt-6 grid gap-8 md:grid-cols-[1fr_16rem]">
        <div class="min-w-0 space-y-8">
          <!-- eslint-disable-next-line vue/no-v-html — sanitized via sanitizeHtml -->
          <div
            v-if="descriptionHtml"
            class="markdown text-sm leading-relaxed"
            v-html="descriptionHtml"
          />
          <MrDiscussion :threads="threads" :full-path="fullPath" :iid="iid" :mr-id="mr.id" />
        </div>
        <MergeRequestDetailRail :mr="mr" />
      </div>
    </template>
  </div>
</template>
