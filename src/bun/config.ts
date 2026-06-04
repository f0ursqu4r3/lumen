import { homedir, platform } from "node:os";
import { join } from "node:path";
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";

export interface AppConfig { gitlabUrl: string | null; token: string | null }

const trimSlash = (s: string) => s.replace(/\/+$/, "");

/** Cross-platform per-user app data dir. Overridable via TRAGIT_CONFIG_DIR (tests). */
export function configDir(): string {
  if (process.env.TRAGIT_CONFIG_DIR) return process.env.TRAGIT_CONFIG_DIR;
  const home = homedir();
  switch (platform()) {
    case "darwin":
      return join(home, "Library", "Application Support", "Tragit");
    case "win32":
      return join(process.env.APPDATA ?? join(home, "AppData", "Roaming"), "Tragit");
    default:
      return join(process.env.XDG_CONFIG_HOME ?? join(home, ".config"), "Tragit");
  }
}

const configPath = () => join(configDir(), "config.json");

export function loadConfig(): AppConfig {
  const path = configPath();
  if (existsSync(path)) {
    const raw = JSON.parse(readFileSync(path, "utf8")) as Partial<AppConfig>;
    return {
      gitlabUrl: raw.gitlabUrl ? trimSlash(raw.gitlabUrl) : null,
      token: raw.token ?? null,
    };
  }
  // First-run convenience: import from environment (.env in dev) if present.
  const envUrl = process.env.GITLAB_URL;
  const envToken = process.env.GITLAB_TOKEN;
  if (envUrl && envToken) return { gitlabUrl: trimSlash(envUrl), token: envToken };
  return { gitlabUrl: null, token: null };
}

export function saveConfig(input: { url: string; token: string }): void {
  const dir = configDir();
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const data: AppConfig = { gitlabUrl: trimSlash(input.url), token: input.token };
  writeFileSync(configPath(), JSON.stringify(data, null, 2), { mode: 0o600 });
}

export function clearConfig(): void {
  const path = configPath();
  if (existsSync(path)) rmSync(path);
}
