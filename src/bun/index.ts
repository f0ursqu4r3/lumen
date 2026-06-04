import Electrobun, { BrowserWindow, BrowserView } from "electrobun/bun";
import { loadConfig, saveConfig, clearConfig } from "./config";
import { gitlabGraphql, gitlabRest, gitlabAsset } from "./gitlab";
import type { LumenRPC } from "@/lib/rpcContract";
import { resolveStartUrl } from "./startUrl";

// LumenRPC describes the RPC *config* shape; it is not the bun/webview *schema*
// shape that BrowserView.defineRPC<Schema extends ElectrobunRPCSchema> expects,
// so the generic is loosened to <any> per the port plan. We still assert the
// authored config against LumenRPC via `satisfies` for editor/type safety,
// keeping the handler names and bodies exactly as the plan specifies.
const rpc = BrowserView.defineRPC<any>({
  maxRequestTime: 30000,
  handlers: {
    requests: {
      gitlabGraphql,
      gitlabRest,
      gitlabAsset,
      getConfig: async () => {
        const { gitlabUrl } = loadConfig();
        return { url: gitlabUrl, configured: Boolean(gitlabUrl) };
      },
      saveConfig: async ({ url, token }) => { saveConfig({ url, token }); return { ok: true }; },
      clearConfig: async () => { clearConfig(); return { ok: true }; },
    },
    messages: {},
  },
} satisfies LumenRPC);

// app:hmr sets LUMEN_HMR=1; only then do we poll for the Vite dev server.
const url = await resolveStartUrl({ hmr: process.env.LUMEN_HMR === "1" });
const win = new BrowserWindow({
  title: "Lumen",
  url,
  frame: { width: 1280, height: 860, x: 80, y: 80 },
  rpc,
});

void win;
void Electrobun;
