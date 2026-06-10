<script setup lang="ts">
// The bare-background dock target that the issue sheet / popped-out window frame
// below their content panel. Registering its presence lets IssueDetail know to
// teleport its save bar here rather than render it in place.
import { useSavebarHostMarker } from '@/features/issues/composables/useSavebarHost'

useSavebarHostMarker()
</script>

<template>
  <div id="issue-savebar-slot" />
</template>
