import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { configDefaults, defineConfig } from "vitest/config";

// `*.workers.test.ts` run inside workerd (project `workers`); every other test runs in Node.
const workersTests = "src/**/*.workers.test.ts";

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "unit",
          environment: "node",
          include: ["src/**/*.test.ts", "scripts/**/*.test.ts"],
          exclude: [...configDefaults.exclude, workersTests],
        },
      },
      {
        plugins: [
          cloudflareTest({
            wrangler: { configPath: "./wrangler.jsonc" },
            // Obviously fake values for the configuration checked at startup. They take
            // precedence over a local .dev.vars, so tests never see a developer's real keys.
            miniflare: {
              bindings: {
                TMDB_API_KEY: "fake-tmdb-api-key",
                // A well-formed P-256 pair is required (J1.13): RFC 8291 §5's published sender
                // pair, never a real key.
                VAPID_PUBLIC_KEY:
                  "BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8",
                VAPID_PRIVATE_KEY:
                  "yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw", // gitleaks:allow (RFC 8291 §5)
                BREVO_API_KEY: "fake-brevo-api-key",
                EXPORT_SECRET: "fake-export-secret",
                // Local workerd does not implement jurisdictions; production stays `eu`.
                DURABLE_OBJECT_JURISDICTION: "none",
              },
            },
          }),
        ],
        test: {
          name: "workers",
          include: [workersTests],
        },
      },
    ],
  },
});
