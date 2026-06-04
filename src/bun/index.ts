import Electrobun, { BrowserWindow, BrowserView } from "electrobun/bun";
import { loadConfig, saveConfig, clearConfig } from "./config";
import { gitlabGraphql, gitlabRest, gitlabAsset } from "./gitlab";
import type { LumenRPC } from "@/lib/rpcContract";

const DEV_URL = "http://localhost:5173";
async function devServerUp(): Promise<boolean> {
  try { return (await fetch(DEV_URL, { method: "HEAD" })).ok; } catch { return false; }
}

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

const url = (await devServerUp()) ? `${DEV_URL}/index.html` : "views://mainview/index.html";
const win = new BrowserWindow({
  title: "Lumen",
  url,
  frame: { width: 1280, height: 860, x: 80, y: 80 },
  rpc,
});

void win;
void Electrobun;
