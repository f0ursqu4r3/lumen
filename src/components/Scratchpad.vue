<script setup lang="ts">
import { computed, ref, toRef, watch } from "vue";
import { useDebounceFn, useLocalStorage } from "@vueuse/core";
import { ChevronRight } from "@lucide/vue";
import { useScratchpad } from "@/composables/useScratchpad";
import { Textarea } from "@/components/ui/textarea";

const props = defineProps<{ fullPath: string; iid: string }>();
const note = useScratchpad(toRef(props, "fullPath"), toRef(props, "iid"));

// Open/closed state persisted per issue (mirrors the note's per-issue keying),
// default collapsed. Key getter re-keys when the viewed issue changes.
const open = useLocalStorage(
  () => `lumen:scratchpad-open:${props.fullPath}#${props.iid}`,
  false,
);

const hasContent = computed(() => note.value.trim() !== "");

// `note` writes to localStorage synchronously; this flag is purely a UX
// affordance. It hides while typing and reappears 500ms after the last edit.
const saved = ref(false);
const flagSaved = useDebounceFn(() => (saved.value = true), 500);
watch(note, () => {
  saved.value = false;
  flagSaved();
});
</script>

<template>
  <section class="space-y-2">
    <div class="flex items-center gap-2">
      <button
        type="button"
        data-testid="scratchpad-toggle"
        :aria-expanded="open"
        class="-ml-1 flex items-center gap-1.5 rounded-md px-1 py-0.5 text-sm font-semibold text-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60"
        @click="open = !open"
      >
        <ChevronRight
          class="size-3.5 text-muted-foreground transition-transform duration-150"
          :class="open ? 'rotate-90' : ''"
        />
        Scratchpad
        <span
          v-if="hasContent"
          data-testid="scratchpad-marker"
          aria-label="has notes"
          class="size-1.5 rounded-full bg-primary"
        />
      </button>
      <!-- Live region stays mounted so screen readers announce the status
           change; only the text toggles. -->
      <span aria-live="polite" class="text-xs text-muted-foreground">
        <template v-if="saved">Saved</template>
      </span>
    </div>
    <Textarea
      v-show="open"
      v-model="note"
      :rows="4"
      placeholder="Private notes, stored only in this browser…"
    />
  </section>
</template>
