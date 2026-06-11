<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { Copy, RefreshCw } from '@lucide/vue'
import { Input } from '@/shared/ui/input'
import { Button } from '@/shared/ui/button'
import { rpc } from '@/shared/lib/rpc'
import { pushToast } from '@/shared/composables/useToast'
import { useConfirm } from '@/shared/composables/useConfirm'
import { buildConnect } from '@/shared/lib/agentConnect'
import type { McpStatus } from '@/shared/lib/rpcContract'
import PaneHeader from './PaneHeader.vue'

const status = ref<McpStatus>({ enabled: false, port: 7437, running: false, hasToken: false })
const port = ref(7437)
const error = ref('')
const busy = ref(false)
const revealed = ref<string | null>(null)
const token = ref<string | null>(null)
const connecting = ref<'claude' | 'codex' | null>(null)
const needsReconnect = ref(false)

const { confirm } = useConfirm()

const statusLabel = computed(() => {
  if (error.value) return error.value
  if (status.value.running) return `Running · 127.0.0.1:${status.value.port}`
  return status.value.enabled ? 'Starting…' : 'Stopped'
})
const maskedToken = computed(() =>
  revealed.value ? revealed.value : status.value.hasToken ? 'lmcp_••••••••••••' : '—',
)
const ready = computed(() => status.value.enabled && status.value.hasToken)
const snippets = computed(() =>
  token.value
    ? buildConnect({ host: '127.0.0.1', port: status.value.port, token: token.value })
    : null,
)

async function loadToken() {
  if (!status.value.hasToken) {
    token.value = null
    return
  }
  const { token: t } = await rpc.revealMcpToken()
  token.value = t
}

async function refresh() {
  status.value = await rpc.getMcpStatus()
  port.value = status.value.port
  await loadToken()
}
onMounted(refresh)

async function toggle() {
  busy.value = true
  error.value = ''
  try {
    const res = await rpc.setMcpEnabled({ enabled: !status.value.enabled, port: port.value })
    if (!res.ok)
      error.value = res.error.includes('EADDRINUSE')
        ? `Port ${port.value} is already in use.`
        : res.error
    await refresh()
  } finally {
    busy.value = false
  }
}

async function regenerate() {
  if (busy.value) return
  busy.value = true
  try {
    const { token: newToken } = await rpc.regenerateMcpToken()
    revealed.value = newToken
    await rpc.clipboardWriteText({ text: newToken })
    pushToast({ title: 'New token copied', tone: 'success' })
    needsReconnect.value = true
    await refresh()
  } finally {
    busy.value = false
  }
}

async function copyToken() {
  const { token: t } = await rpc.revealMcpToken()
  if (!t) return
  revealed.value = t
  await rpc.clipboardWriteText({ text: t })
  pushToast({ title: 'Token copied', tone: 'success' })
}

async function copy(text: string, label: string) {
  await rpc.clipboardWriteText({ text })
  pushToast({ title: `${label} copied`, tone: 'success' })
}

async function connect(which: 'claude' | 'codex') {
  const ok = await confirm(
    which === 'claude'
      ? {
          title: 'Connect Claude Code?',
          description:
            'Runs claude mcp add if available, otherwise writes ~/.claude.json. Overwrites any existing "lumen" server entry.',
          confirmLabel: 'Connect',
          cancelLabel: 'Cancel',
        }
      : {
          title: 'Connect Codex?',
          description:
            'Writes ~/.codex/config.toml (a .bak is saved first). Overwrites any existing "lumen" server entry.',
          confirmLabel: 'Connect',
          cancelLabel: 'Cancel',
        },
  )
  if (!ok) return
  connecting.value = which
  needsReconnect.value = false
  try {
    const res = which === 'claude' ? await rpc.connectClaudeCode() : await rpc.connectCodex()
    if (res.ok) {
      pushToast({
        title: which === 'claude' ? 'Claude Code connected' : 'Codex connected',
        description: res.method === 'cli' ? 'Added via claude mcp add' : 'Wrote agent config file',
        tone: 'success',
      })
    } else {
      pushToast({ title: 'Connect failed', description: res.error, tone: 'failed' })
    }
  } finally {
    connecting.value = null
  }
}
</script>

<template>
  <section class="max-w-lg space-y-5">
    <PaneHeader
      eyebrow="Agent access (MCP)"
      title="Let agents work through Lumen"
      description="Exposes a local, token-protected MCP server so tools like Claude Code can read and act on your GitLab data. Off by default; bound to 127.0.0.1."
    />

    <div class="flex items-center justify-between border-b border-border/50 py-3">
      <div>
        <p class="text-sm text-foreground">Enable MCP server</p>
        <p
          class="font-mono text-2xs"
          :class="
            error
              ? 'text-destructive'
              : status.running
                ? 'text-emerald-400'
                : 'text-muted-foreground'
          "
        >
          {{ statusLabel }}
        </p>
      </div>
      <Button
        data-testid="mcp-enable"
        :variant="status.enabled ? 'default' : 'outline'"
        :disabled="busy"
        :aria-pressed="status.enabled"
        @click="toggle"
      >
        {{ status.enabled ? 'Enabled' : 'Disabled' }}
      </Button>
    </div>

    <div class="flex items-center justify-between border-b border-border/50 py-3">
      <p class="text-sm text-foreground">Port</p>
      <Input v-model.number="port" type="number" class="h-8 w-24 text-right font-mono text-sm" />
    </div>

    <div class="flex items-center justify-between border-b border-border/50 py-3">
      <div>
        <p class="text-sm text-foreground">Access token</p>
        <p class="font-mono text-2xs text-muted-foreground">{{ maskedToken }}</p>
      </div>
      <div class="flex gap-2">
        <Button variant="outline" size="sm" :disabled="!status.hasToken" @click="copyToken"
          ><Copy class="size-3.5" /> Copy</Button
        >
        <Button
          data-testid="mcp-regenerate"
          variant="outline"
          size="sm"
          :disabled="busy"
          @click="regenerate"
          ><RefreshCw class="size-3.5" /> Regenerate</Button
        >
      </div>
    </div>

    <div
      v-if="!ready"
      class="rounded-lg border border-border/60 bg-card/40 p-4 text-sm text-muted-foreground"
    >
      Enable agent access first to connect Claude Code or Codex.
    </div>

    <template v-else-if="snippets">
      <p v-if="needsReconnect" class="font-mono text-2xs text-amber-400">
        Token changed — re-run Connect to update already-configured agents.
      </p>

      <!-- Claude Code -->
      <div class="space-y-2 rounded-lg border border-border/60 bg-card/40 p-4">
        <div class="flex items-center justify-between">
          <p class="text-sm font-medium text-foreground">Claude Code</p>
          <Button
            data-testid="connect-claude"
            size="sm"
            :disabled="connecting === 'claude'"
            @click="connect('claude')"
            >Connect</Button
          >
        </div>
        <div class="flex items-center justify-between">
          <p class="font-mono text-2xs text-muted-foreground">CLI</p>
          <Button variant="ghost" size="sm" @click="copy(snippets.claude.cli, 'CLI command')"
            ><Copy class="size-3.5" /> Copy</Button
          >
        </div>
        <pre
          class="overflow-auto rounded-lg border border-border/60 bg-card/50 p-3 font-mono text-xs text-muted-foreground"
          >{{ snippets.claude.cli }}</pre
        >
        <div class="flex items-center justify-between">
          <p class="font-mono text-2xs text-muted-foreground">.mcp.json</p>
          <Button variant="ghost" size="sm" @click="copy(snippets.claude.json, '.mcp.json')"
            ><Copy class="size-3.5" /> Copy</Button
          >
        </div>
        <pre
          class="overflow-auto rounded-lg border border-border/60 bg-card/50 p-3 font-mono text-xs text-muted-foreground"
          >{{ snippets.claude.json }}</pre
        >
      </div>

      <!-- Codex -->
      <div class="space-y-2 rounded-lg border border-border/60 bg-card/40 p-4">
        <div class="flex items-center justify-between">
          <p class="text-sm font-medium text-foreground">Codex CLI</p>
          <Button
            data-testid="connect-codex"
            size="sm"
            :disabled="connecting === 'codex'"
            @click="connect('codex')"
            >Connect</Button
          >
        </div>
        <div class="flex items-center justify-between">
          <p class="font-mono text-2xs text-muted-foreground">~/.codex/config.toml</p>
          <Button variant="ghost" size="sm" @click="copy(snippets.codex.toml, 'Codex config')"
            ><Copy class="size-3.5" /> Copy</Button
          >
        </div>
        <pre
          class="overflow-auto rounded-lg border border-border/60 bg-card/50 p-3 font-mono text-xs text-muted-foreground"
          >{{ snippets.codex.toml }}</pre
        >
      </div>

      <!-- Other client -->
      <div class="space-y-2 rounded-lg border border-border/60 bg-card/40 p-4">
        <p
          class="font-mono text-2xs font-semibold tracking-[0.12em] text-muted-foreground uppercase"
        >
          Other client
        </p>
        <p class="font-mono text-xs text-muted-foreground">
          URL <span class="text-foreground">{{ snippets.raw.url }}</span>
        </p>
        <div class="flex items-center justify-between gap-2">
          <p class="overflow-auto font-mono text-xs text-muted-foreground">
            Header <span class="text-foreground">{{ snippets.raw.header }}</span>
          </p>
          <Button variant="ghost" size="sm" @click="copy(snippets.raw.header, 'Auth header')"
            ><Copy class="size-3.5" /> Copy</Button
          >
        </div>
      </div>

      <p class="font-mono text-2xs text-muted-foreground">
        Connections work only while Lumen is running with agent access enabled.
      </p>
    </template>
  </section>
</template>
