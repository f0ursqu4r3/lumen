import Electrobun, { BrowserWindow } from "electrobun/bun";

const DEV_URL = "http://localhost:5173";

async function devServerUp(): Promise<boolean> {
  try {
    const res = await fetch(DEV_URL, { method: "HEAD" });
    return res.ok;
  } catch {
    return false;
  }
}

const url = (await devServerUp()) ? `${DEV_URL}/index.html` : "views://mainview/index.html";

const win = new BrowserWindow({
  title: "Tragit",
  url,
  frame: { width: 1280, height: 860, x: 80, y: 80 },
});

void win;
void Electrobun;
