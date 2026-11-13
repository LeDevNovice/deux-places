import { cruise } from "dependency-cruiser";
import { describe, expect, it } from "vitest";

// Plan J1.16: the import never exists in production. The deployed Worker is built from
// wrangler.jsonc's `main`, src/server/worker.ts (the workers project runs that `main`: its test
// "the deployed household has no import method" fails if it becomes the restore entry), and what it
// imports: none of those modules may be the import (runtime/import.ts) or the local restore's entry
// (runtime/restore-local.ts), whatever route or method name would call them, as long as import
// specifiers are literal (dependency-cruiser does not resolve a computed one). Resolution as in
// .dependency-cruiser.cjs.
const deployedEntry = "src/server/worker.ts";

const deployedModules = async () => {
  const { output } = await cruise([deployedEntry], {
    doNotFollow: { path: "node_modules" },
    tsConfig: { fileName: "tsconfig.json" },
    parser: "swc",
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "types", "default"],
    },
  });
  if (typeof output === "string") throw new TypeError("no cruise result");
  return output.modules.map((module) => module.source);
};

describe("deployed Worker — no module of the import (plan J1.16)", () => {
  it("worker.ts reaches the household and its export, never the import", async () => {
    const modules = await deployedModules();

    // Not vacuous: the graph follows worker.ts down to the household and its export.
    expect(modules).toEqual(
      expect.arrayContaining([
        "src/server/worker.ts",
        "src/server/runtime/household.ts",
        "src/server/runtime/export.ts",
      ]),
    );
    expect(modules).not.toContain("src/server/runtime/import.ts");
    expect(modules).not.toContain("src/server/runtime/restore-local.ts");
  }, 30_000);
});
