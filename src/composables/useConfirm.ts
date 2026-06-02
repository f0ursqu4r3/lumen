import { reactive } from "vue";

export interface ConfirmOptions {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
}

// Module-level singleton so any caller can `confirm(...)` and one mounted
// <ConfirmDialog/> renders it. Promise-based for use inside navigation guards.
export const confirmState = reactive<
  ConfirmOptions & { open: boolean; resolve: ((v: boolean) => void) | null }
>({
  open: false,
  title: "",
  description: undefined,
  confirmLabel: undefined,
  cancelLabel: undefined,
  resolve: null,
});

export function useConfirm() {
  function confirm(opts: ConfirmOptions): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      confirmState.title = opts.title;
      confirmState.description = opts.description;
      confirmState.confirmLabel = opts.confirmLabel ?? "Discard";
      confirmState.cancelLabel = opts.cancelLabel ?? "Keep editing";
      confirmState.open = true;
      confirmState.resolve = (v: boolean) => {
        confirmState.open = false;
        confirmState.resolve = null;
        resolve(v);
      };
    });
  }
  return { confirm };
}
