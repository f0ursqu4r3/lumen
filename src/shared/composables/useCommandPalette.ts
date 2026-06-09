import { ref } from 'vue'

// Module-level so the palette (mounted once in App.vue) and any opener (the
// shell's Search button, the ⌘K handler) share one open flag.
const isOpen = ref(false)

export function useCommandPalette() {
  return {
    isOpen,
    open: () => {
      isOpen.value = true
    },
    close: () => {
      isOpen.value = false
    },
  }
}
