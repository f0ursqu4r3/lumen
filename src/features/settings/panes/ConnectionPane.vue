<script setup lang="ts">
import { useRouter } from 'vue-router'
import { useQueryClient } from '@tanstack/vue-query'
import { KeyRound, LoaderCircle, Server, Unplug, TriangleAlert } from '@lucide/vue'
import { Input } from '@/shared/ui/input'
import { Label } from '@/shared/ui/label'
import { Button } from '@/shared/ui/button'
import { rpc } from '@/shared/lib/rpc'
import { clearPersistedCache } from '@/shared/lib/persist'
import { useGitlabConnect } from '@/shared/composables/useGitlabConnect'
import { useConfirm } from '@/shared/composables/useConfirm'
import { pushToast } from '@/shared/composables/useToast'
import PaneHeader from './PaneHeader.vue'

const router = useRouter()
const queryClient = useQueryClient()
const { confirm } = useConfirm()
const { url, token, tokenPlaceholder, status, message, testing, canSubmit, save } =
  useGitlabConnect({ allowExistingToken: true })

async function saveConnection() {
  if (await save()) {
    token.value = ''
    queryClient.clear()
    clearPersistedCache()
    pushToast({ title: 'Connection updated', tone: 'success' })
  }
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
  <section class="max-w-lg space-y-4">
    <PaneHeader
      eyebrow="Connection"
      title="GitLab connection"
      description="The instance Lumen talks to and the token it uses."
    />

    <div class="space-y-2">
      <Label
        for="settings-url"
        class="font-mono text-2xs font-medium tracking-[0.06em] text-muted-foreground uppercase"
      >
        <Server class="size-3.5 text-muted-foreground/70" /> GitLab URL
      </Label>
      <Input
        id="settings-url"
        v-model="url"
        type="url"
        autocomplete="off"
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
        <KeyRound class="size-3.5 text-muted-foreground/70" /> Token
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

    <Button data-testid="settings-save-connection" :disabled="!canSubmit" @click="saveConnection">
      <LoaderCircle v-if="testing" class="size-4 animate-spin" />
      <span v-else>Save connection</span>
    </Button>

    <Button
      data-testid="settings-disconnect"
      variant="ghost"
      class="text-destructive hover:text-destructive"
      @click="disconnect"
    >
      <Unplug class="size-4" /> Disconnect
    </Button>
  </section>
</template>
