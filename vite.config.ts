import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";

// Paths below `root` are relative to it; `root` is relative to the repository (scripts run there).
export default defineConfig({
  root: "src/web",
  build: { outDir: "../../dist", emptyOutDir: true },
  plugins: [cloudflare({ configPath: "../../wrangler.jsonc" })],
});
