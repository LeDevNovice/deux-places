/** Architecture boundaries (technique-v2 §4, ADR-001, ADR-022). Human-owned: tighten only. */
/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    { name: "no-circular", severity: "error", from: {}, to: { circular: true } },
    {
      name: "domain-is-pure",
      comment: "domain/ imports only its own folder, the shared kernel and the effect root (Result, Option, Data, Brand).",
      severity: "error",
      from: { path: "^src/server/modules/[^/]+/domain/" },
      to: {
        pathNot: ["^src/server/modules/[^/]+/domain/", "^src/shared-kernel/", "^node_modules/effect/"],
      },
    },
    {
      name: "domain-no-effect-subpaths",
      comment: "No runtime, schema or platform modules in the domain.",
      severity: "error",
      from: { path: "^(src/server/modules/[^/]+/domain|src/shared-kernel)/" },
      to: { path: "^node_modules/(@effect/|effect/dist/.*/(sql|http|http-api|rpc|cluster|workflow)/)" },
    },
    {
      name: "application-not-infra",
      severity: "error",
      from: { path: "^src/server/modules/[^/]+/application/" },
      to: { path: "^src/server/modules/[^/]+/(infrastructure|interface)/" },
    },
    {
      name: "modules-through-index",
      comment: "A module reaches another module only through its index.ts.",
      severity: "error",
      from: { path: "^src/server/modules/([^/]+)/" },
      to: { path: "^src/server/modules/([^/]+)/", pathNot: ["^src/server/modules/$1/", "^src/server/modules/[^/]+/index\\.ts$"] },
    },
    {
      name: "cloudflare-only-in-runtime",
      severity: "error",
      from: { pathNot: "^src/server/(runtime/|worker\\.ts$)" },
      to: { path: "cloudflare:" , dependencyTypes: ["core", "unknown", "undetermined"] },
    },
    { name: "web-not-server", severity: "error", from: { path: "^src/(web|ui)/" }, to: { path: "^src/server/" } },
    { name: "server-not-web", severity: "error", from: { path: "^src/server/" }, to: { path: "^src/(web|ui)/" } },
    {
      name: "contracts-standalone",
      severity: "error",
      from: { path: "^src/contracts/" },
      to: { path: "^src/(server|web|ui)/" },
    },
    {
      name: "no-test-code-in-prod",
      severity: "error",
      from: { pathNot: "\\.(test|spec)\\.tsx?$|/testing/|^e2e/" },
      to: { path: "\\.(test|spec)\\.tsx?$|/testing/" },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    tsConfig: { fileName: "tsconfig.json" },
    enhancedResolveOptions: { exportsFields: ["exports"], conditionNames: ["import", "types", "default"] },
  },
};
