import { useLocalStorage, StorageSerializers } from "@vueuse/core";
import { computed, type Ref } from "vue";

// Local-only note for a single issue, stored in this browser only — never sent
// to GitLab. Keyed by fullPath + iid to mirror `issueKey` and stay isolated
// per issue. The key is a getter so the ref re-keys when the viewed issue
// changes (navigation, or the drawer's `:key="iid"` remount).
//
// We pass the `object` serializer explicitly so values are JSON-encoded in
// localStorage (consistent with other structured data in the store and easy
// to inspect/migrate in the future).
export function useScratchpad(
  fullPath: Ref<string>,
  iid: Ref<string>,
): Ref<string> {
  const stored = useLocalStorage<string | null>(
    () => `lumen:scratchpad:${fullPath.value}#${iid.value}`,
    null,
    {
      serializer: StorageSerializers.object,
      writeDefaults: false,
    },
  );

  return computed({
    get: () => stored.value ?? "",
    set: (value) => {
      stored.value = value.trim() ? value : null;
    },
  });
}
