<script setup lang="ts">
import { ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useQueryClient } from '@tanstack/vue-query'
import { KeyRound, LoaderCircle, Server, Trash2, Unplug, TriangleAlert } from '@lucide/vue'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/shared/ui/dialog'
import { Input } from '@/shared/ui/input'
import { Label } from '@/shared/ui/label'
import { Button } from '@/shared/ui/button'
import { rpc } from '@/shared/lib/rpc'
import { clearPersistedCache } from '@/shared/lib/persist'
import { useGitlabConnect, PROBE_QUERY } from '@/shared/composables/useGitlabConnect'
import { useConfirm } from '@/shared/composables/useConfirm'
import { pushToast } from '@/shared/composables/useToast'
import { settingsState, closeSettings } from '@/shared/composables/useSettings'

const router = useRouter()
const queryClient = useQueryClient()
const { confirm } = useConfirm()

const version = __APP_VERSION__
const username = ref<string | null>(null)

// Reuse onboarding's connect state, but settings can keep the existing token
// when only the URL changes. The host never returns the token itself, just a
// short suffix for the input placeholder.
const { url, token, tokenSuffix, tokenPlaceholder, status, message, testing, canSubmit, save } =
  useGitlabConnect({ allowExistingToken: true })

// Refresh the read-only fields whenever the dialog opens, in case the instance
// or identity changed since last time.
async function hydrate() {
  const cfg = await rpc.getConfig()
  url.value = cfg.url ?? ''
  tokenSuffix.value = cfg.tokenSuffix
  token.value = ''
  status.value = 'idle'
  message.value = ''
  try {
    const res = await rpc.gitlabGraphql({ query: PROBE_QUERY })
    const u = (res.data as { currentUser?: { username?: string } } | undefined)?.currentUser
      ?.username
    username.value = u ?? null
  } catch {
    username.value = null
  }
}

// reka-ui only emits update:open on its own (user-driven) open/close, not when
// the `open` prop is flipped programmatically (e.g. the native ⌘, menu). Watch
// the shared state directly so hydrate always runs on open; keep onOpenChange
// for the user-driven close path.
watch(
  () => settingsState.open,
  (open) => {
    if (open) void hydrate()
  },
  { immediate: true },
)

function onOpenChange(open: boolean) {
  if (!open) closeSettings()
}

async function saveConnection() {
  if (await save()) {
    token.value = ''
    queryClient.clear()
    clearPersistedCache()
    pushToast({ title: 'Connection updated', tone: 'success' })
  }
}

function clearCache() {
  queryClient.clear()
  clearPersistedCache()
  pushToast({ title: 'Cache cleared', tone: 'success' })
}

async function disconnect() {
  const ok = await confirm({
    title: 'Disconnect from GitLab?',
    description: 'Your token is removed from this machine and cached data is cleared.',
    confirmLabel: 'Disconnect',
    cancelLabel: 'Cancel',
  })
  if (!ok) return
  try {
    await rpc.clearConfig()
    queryClient.clear()
    clearPersistedCache()
    closeSettings()
    router.replace({ name: 'connect' })
  } catch (e) {
    pushToast({
      title: 'Could not disconnect',
      description: e instanceof Error ? e.message : undefined,
      tone: 'failed',
    })
  }
}
</script>

<template>
  <Dialog :open="settingsState.open" @update:open="onOpenChange">
    <DialogContent class="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>Settings</DialogTitle>
        <DialogDescription class="sr-only">
          Manage your GitLab connection, view app info, and clear cached data.
        </DialogDescription>
      </DialogHeader>

      <div class="flex flex-col gap-6">
        <!-- Connection -->
        <section class="space-y-3">
          <p
            class="font-mono text-2xs font-semibold tracking-[0.12em] text-muted-foreground uppercase"
          >
            Connection
          </p>

          <div class="space-y-2">
            <Label
              for="settings-url"
              class="font-mono text-2xs font-medium tracking-[0.06em] text-muted-foreground uppercase"
            >
              <Server class="size-3.5 text-muted-foreground/70" />
              GitLab URL
            </Label>
            <Input
              id="settings-url"
              v-model="url"
              type="url"
              autocomplete="off"
              autocapitalize="off"
              spellcheck="false"
              placeholder="https://gitlab.example.com"
              :disabled="testing"
              class="h-9 font-mono text-sm"
              @keydown.enter.prevent="saveConnection"
            />
          </div>

          <div class="space-y-2">
            <Label
              for="settings-token"
              class="font-mono text-2xs font-medium tracking-[0.06em] text-muted-foreground uppercase"
            >
              <KeyRound class="size-3.5 text-muted-foreground/70" />
              Token
            </Label>
            <Input
              id="settings-token"
              v-model="token"
              type="password"
              autocomplete="off"
              spellcheck="false"
              :placeholder="tokenPlaceholder"
              :disabled="testing"
              class="h-9 font-mono text-sm"
              @keydown.enter.prevent="saveConnection"
            />
            <div
              v-if="status === 'error'"
              class="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2"
              role="alert"
            >
              <TriangleAlert class="mt-px size-4 shrink-0 text-destructive" :stroke-width="2" />
              <p class="text-sm leading-relaxed text-foreground/90">{{ message }}</p>
            </div>
          </div>

          <Button
            data-testid="settings-save-connection"
            :disabled="!canSubmit"
            @click="saveConnection"
          >
            <LoaderCircle v-if="testing" class="size-4 animate-spin" />
            <span v-else>Save connection</span>
          </Button>

          <Button
            data-testid="settings-disconnect"
            variant="ghost"
            class="text-destructive hover:text-destructive"
            @click="disconnect"
          >
            <Unplug class="size-4" />
            Disconnect
          </Button>
        </section>

        <!-- About -->
        <section class="space-y-1">
          <p
            class="font-mono text-2xs font-semibold tracking-[0.12em] text-muted-foreground uppercase"
          >
            About
          </p>
          <p class="text-sm text-muted-foreground">
            lumen v{{ version }}
            <span v-if="username"> · @{{ username }}</span>
          </p>
        </section>

        <!-- Cache -->
        <section class="space-y-2">
          <p
            class="font-mono text-2xs font-semibold tracking-[0.12em] text-muted-foreground uppercase"
          >
            Cache
          </p>
          <Button data-testid="settings-clear-cache" variant="outline" @click="clearCache">
            <Trash2 class="size-4" />
            Clear cached data
          </Button>
        </section>
      </div>
    </DialogContent>
  </Dialog>
</template>
