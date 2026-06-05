import type { ElectrobunConfig } from "electrobun";

export default {
  app: { name: "Lumen", identifier: "com.kdougan.lumen", version: "0.1.0" },
  build: {
    bun: { entrypoint: "src/bun/index.ts" },
    views: { mainview: { entrypoint: "src/mainview/index.ts" } },
    copy: {
      "dist/index.html": "views/mainview/index.html",
      "dist/assets": "views/mainview/assets",
    },
    mac: { bundleCEF: false, icons: "assets/macos/AppIcon.iconset" },
    linux: { bundleCEF: false },
    win: { bundleCEF: false },
  },
  runtime: { exitOnLastWindowClosed: true },
} satisfies ElectrobunConfig;
