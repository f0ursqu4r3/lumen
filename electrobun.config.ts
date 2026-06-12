import type { ElectrobunConfig } from "electrobun";

// Code signing is opt-in via env, so a plain `bun run build` stays unsigned and
// never fails for lack of a certificate. Set ELECTROBUN_DEVELOPER_ID to a signing
// identity to sign the build:
//   - self-signed (local):  scripts/make-signing-cert.sh, then
//       export ELECTROBUN_DEVELOPER_ID="Lumen Self-Signed"
//   - Apple Developer ID:   export ELECTROBUN_DEVELOPER_ID="Developer ID Application: … (TEAMID)"
// Notarization (the only thing that fully satisfies Gatekeeper for downloaded
// apps) additionally needs Apple credentials, so it only turns on when an Apple
// ID / App Store Connect key is also present (see README → Code signing).
// NOTE: Electrobun only signs release builds (`electrobun build --env=canary` or
// `--env=stable`, i.e. `bun run dist`); the default dev build can't be codesigned.
const codesign = Boolean(process.env.ELECTROBUN_DEVELOPER_ID);
const notarize =
  codesign &&
  Boolean(process.env.ELECTROBUN_APPLEID || process.env.ELECTROBUN_APPLEAPIKEY);
const envArg = process.argv.find((arg) => arg.startsWith("--env="))?.split("=")[1];
const isStable = envArg === "stable";

export default {
  app: {
    name: "Lumen",
    identifier: "com.kdougan.lumen",
    version: "0.1.0",
    // Registers the lumen:// scheme on macOS (requires the app be in /Applications).
    urlSchemes: ["lumen"],
  },
  build: {
    bun: { entrypoint: "src/bun/index.ts" },
    views: { mainview: { entrypoint: "src/mainview/index.ts" } },
    copy: {
      "dist/index.html": "views/mainview/index.html",
      "dist/assets": "views/mainview/assets",
    },
    mac: {
      bundleCEF: false,
      icons: "assets/macos/AppIcon.iconset",
      createDmg: !isStable,
      codesign,
      notarize,
    },
    linux: { bundleCEF: false },
    win: { bundleCEF: false },
  },
  runtime: { exitOnLastWindowClosed: true },
} satisfies ElectrobunConfig;
