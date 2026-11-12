import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";

// Paths below `root` are relative to it; `root` is relative to the repository (scripts run there).
export default defineConfig({
  root: "src/web",
  build: { outDir: "../../dist", emptyOutDir: true },
  // The only worker is the service worker (src/web/main.tsx imports it with `?worker&url`): built
  // on its own as one classic script (Vite's default worker format, iife), and served at /sw.js
  // rather than /assets/, so that its scope is the whole site (plan J1.14).
  worker: { rolldownOptions: { output: { entryFileNames: "sw.js" } } },
  plugins: [cloudflare({ configPath: "../../wrangler.jsonc" })],
});
