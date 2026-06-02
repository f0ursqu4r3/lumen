import { createApp } from "vue";
import { VueQueryPlugin } from "@tanstack/vue-query";
import App from "./App.vue";
import { router } from "./router";
import "./styles.css";

// A quiet boot signature for whoever opens the console — styled like a telemetry
// readout, in keeping with the instrument it sits behind. (Discovered, not announced.)
console.log(
  "%c●%c tragit%c ▸ operational",
  "color:oklch(0.82 0.142 81);font-size:13px;text-shadow:0 0 8px oklch(0.82 0.142 81/0.7)",
  "color:oklch(0.945 0.006 256);font-weight:600;font-family:ui-monospace,monospace",
  "color:oklch(0.66 0.018 256);font-family:ui-monospace,monospace",
);

createApp(App).use(router).use(VueQueryPlugin).mount("#app");
