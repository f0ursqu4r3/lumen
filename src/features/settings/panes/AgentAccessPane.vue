<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { Copy, RefreshCw } from '@lucide/vue'
import { Input } from '@/shared/ui/input'
import { Button } from '@/shared/ui/button'
import { rpc } from '@/shared/lib/rpc'
import { pushToast } from '@/shared/composables/useToast'
import type { McpStatus } from '@/shared/lib/rpcContract'
import PaneHeader from './PaneHeader.vue'

const status = ref<McpStatus>({ enabled: false, port: 7437, running: false, hasToken: false })
const port = ref(7437)
const error = ref('')
const busy = ref(false)
const revealed = ref<string | null>(null)

const statusLabel = computed(() => {
  if (error.value) return error.value
  if (status.value.running) return `Running · 127.0.0.1:${status.value.port}`
  return status.value.enabled ? 'Starting…' : 'Stopped'
})
const maskedToken = computed(() =>
  revealed.value ? revealed.value : status.value.hasToken ? 'lmcp_••••••••••••' : '—',
)
const snippet = computed(() =>
  JSON.stringify(
    {
      mcpServers: {
        lumen: {
          url: `http://127.0.0.1:${status.value.port}/`,
          headers: { Authorization: 'Bearer <token>' },
        },
      },
    },
    null,
    2,
  ),
)

async function refresh() {
  status.value = await rpc.getMcpStatus()
  port.value = status.value.port
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
    const { token } = await rpc.regenerateMcpToken()
    revealed.value = token
    await rpc.clipboardWriteText({ text: token })
    pushToast({ title: 'New token copied', tone: 'success' })
    await refresh()
  } finally {
    busy.value = false
  }
}

async function copyToken() {
  const { token } = await rpc.revealMcpToken()
  if (!token) return
  revealed.value = token
  await rpc.clipboardWriteText({ text: token })
  pushToast({ title: 'Token copied', tone: 'success' })
}

async function copySnippet() {
  await rpc.clipboardWriteText({ text: snippet.value })
  pushToast({ title: 'Client config copied', tone: 'success' })
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

    <div class="space-y-2">
      <div class="flex items-center justify-between">
        <p
          class="font-mono text-2xs font-semibold tracking-[0.12em] text-muted-foreground uppercase"
        >
          Client config
        </p>
        <Button variant="ghost" size="sm" @click="copySnippet"
          ><Copy class="size-3.5" /> Copy</Button
        >
      </div>
      <pre
        class="overflow-auto rounded-lg border border-border/60 bg-card/50 p-3 font-mono text-xs text-muted-foreground"
        >{{ snippet }}</pre
      >
    </div>
  </section>
</template>
