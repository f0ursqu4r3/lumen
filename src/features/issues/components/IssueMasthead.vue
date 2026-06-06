<script setup lang="ts">
import { Check, Link, ExternalLink, ArrowLeft } from '@lucide/vue'
import { Button } from '@/shared/ui/button'
import StateBadge from '@/features/issues/components/StateBadge.vue'

defineProps<{
  issue: {
    iid: string
    title: string
    author?: { name?: string | null; username: string } | null
    createdAt: string
    webUrl: string
  }
  repoName: string
  state: string
  embedded?: boolean
  windowed?: boolean
  linkCopied: null | 'url' | 'md'
  fullPath: string
}>()
defineEmits<{ copy: [e: MouseEvent]; 'open-external': []; 'toggle-state': [] }>()

// two-letter-free name helper (avatars elsewhere are initials; this is the byline)
function nameOrUsername(user?: { name?: string | null; username: string } | null) {
  return user?.name || `@${user?.username}` || '(deleted user)'
}
</script>

<template>
  <header class="animate-row-in">
    <!-- The eyebrow doubles as the way back. Full-page (deep link / refresh —
         the cards and rows open the drawer, so this view is the only one that
         strands you) it's a link to this repo's issue list, the arrow taking
         the tick's lead position. Embedded in the drawer it stays inert text:
         the list is already behind it, and the dirty guard lives on the host. -->
    <RouterLink
      v-if="!embedded && !windowed"
      :to="{ name: 'issues', params: { fullPath } }"
      data-testid="back-to-issues"
      class="group/back -mx-1 inline-flex max-w-full items-center gap-1.5 rounded-sm px-1 font-mono text-micro font-semibold tracking-[0.28em] text-muted-foreground/80 uppercase outline-none transition-colors hover:text-foreground focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring/50"
    >
      <ArrowLeft
        class="size-3 shrink-0 text-primary transition-transform group-hover/back:-translate-x-0.5"
      />
      <span class="min-w-0 truncate">{{ repoName }}</span>
    </RouterLink>
    <p
      v-else
      class="eyebrow-tick max-w-full font-mono text-micro font-semibold tracking-[0.28em] text-muted-foreground/80 uppercase"
    >
      <span class="min-w-0 truncate">{{ repoName }}</span>
    </p>
    <div class="mt-2.5 flex items-center gap-2.5">
      <!-- Keyed by state so toggling open/closed re-triggers the quiet status flash. -->
      <StateBadge :key="state" :state="state" class="animate-status" />
      <span
        class="inline-flex items-center rounded-md bg-muted/70 px-1.5 py-0.5 font-mono text-sm font-medium tabular-nums text-foreground/90 ring-1 ring-inset ring-border/60"
      >
        <span class="text-muted-foreground/45">#</span>{{ issue.iid }}
      </span>
      <Button
        type="button"
        data-testid="copy-link"
        variant="ghost"
        size="icon-xs"
        class="text-muted-foreground"
        title="Copy link · Shift+Click to copy a markdown link"
        @click="$emit('copy', $event)"
      >
        <component :is="linkCopied ? Check : Link" class="size-3.5" />
      </Button>

      <Button
        type="button"
        data-testid="open-in-gitlab"
        variant="ghost"
        size="sm"
        class="ml-auto text-muted-foreground"
        title="Open this issue in GitLab"
        @click="$emit('open-external')"
      >
        <ExternalLink class="size-3.5" />
        Open in GitLab
      </Button>
      <Button
        type="button"
        data-testid="toggle-state"
        variant="outline"
        size="sm"
        @click="$emit('toggle-state')"
      >
        {{ state === 'opened' ? 'Close issue' : 'Reopen issue' }}
      </Button>
    </div>

    <p class="mt-4 text-xs text-muted-foreground">
      Opened by
      <span class="font-medium text-foreground">{{ nameOrUsername(issue.author) }}</span>
      <span class="px-1 text-muted-foreground/50">·</span>
      <span class="font-mono">{{ new Date(issue.createdAt).toLocaleDateString() }}</span>
    </p>
  </header>
</template>
