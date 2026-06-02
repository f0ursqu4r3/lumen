<script setup lang="ts">
import { ref } from "vue";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { confirmState } from "@/composables/useConfirm";

// Track what was chosen before the dialog closes so onOpenChange can pick the
// right outcome. Set to true on accept, false on cancel/dismiss.
const chosen = ref<boolean | null>(null);

function handleAccept() {
  chosen.value = true;
}

function handleCancel() {
  chosen.value = false;
}

// onOpenChange fires after reka-ui begins closing — read `chosen` to decide
// whether this was an accept (true), explicit cancel (false), or esc/backdrop
// dismiss (null → treat as cancel).
function onOpenChange(open: boolean) {
  if (!open) {
    const result = chosen.value ?? false;
    chosen.value = null;
    confirmState.resolve?.(result);
  }
}
</script>

<template>
  <AlertDialog :open="confirmState.open" @update:open="onOpenChange">
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>{{ confirmState.title }}</AlertDialogTitle>
        <AlertDialogDescription v-if="confirmState.description">
          {{ confirmState.description }}
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel
          data-testid="confirm-cancel"
          @click="handleCancel"
        >
          {{ confirmState.cancelLabel }}
        </AlertDialogCancel>
        <AlertDialogAction
          data-testid="confirm-accept"
          @click.capture="handleAccept"
        >
          {{ confirmState.confirmLabel }}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>
