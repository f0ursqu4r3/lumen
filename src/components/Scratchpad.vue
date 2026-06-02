<script setup lang="ts">
import { ref, toRef, watch } from "vue";
import { useDebounceFn } from "@vueuse/core";
import { useScratchpad } from "@/composables/useScratchpad";
import { Textarea } from "@/components/ui/textarea";

const props = defineProps<{ fullPath: string; iid: string }>();
const note = useScratchpad(toRef(props, "fullPath"), toRef(props, "iid"));

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
      <h2 class="text-sm font-semibold">Scratchpad</h2>
      <!-- Live region stays mounted so screen readers announce the status
           change; only the text toggles. -->
      <span aria-live="polite" class="text-xs text-muted-foreground">
        <template v-if="saved">Saved</template>
      </span>
    </div>
    <Textarea
      v-model="note"
      :rows="4"
      placeholder="Private notes, stored only in this browser…"
    />
  </section>
</template>
