import { Exit, Schema } from "effect";
import { OpenApi } from "effect/http-api";
import { describe, expect, it } from "vitest";
import { Api, Health } from "./api";

// Expectations come from plan line J1.5 and technique-v2 §6.1, not from the code's output.
const spec = OpenApi.fromApi(Api);

describe("API contract (technique-v2 §6.1)", () => {
  it("declares GET /api/v1/health in the system group", () => {
    const health = spec.paths["/api/v1/health"]?.get;
    expect(health).toBeDefined();
    expect(health?.tags).toEqual(["system"]);
  });

  it("answers GET /api/v1/health with a 200 JSON body { status, version }", () => {
    const body =
      spec.paths["/api/v1/health"]?.get?.responses["200"]?.content?.[
        "application/json"
      ]?.schema;
    const schema = resolve(body);
    expect(Object.keys(schema?.["properties"] ?? {}).toSorted()).toEqual([
      "status",
      "version",
    ]);
    expect(schema?.["required"]).toEqual(
      expect.arrayContaining(["status", "version"]),
    );
  });

  // §6.2: no input to decode (no `validation`), no resource to look up (no `not-found`), no
  // rate limit on this route; an unexpected error is a bare 500 outside the table.
  it("declares no error response for GET /api/v1/health", () => {
    const responses = spec.paths["/api/v1/health"]?.get?.responses ?? {};
    expect(Object.keys(responses)).toEqual(["200"]);
  });
});

describe("Health response schema", () => {
  const decode = Schema.decodeUnknownExit(Health);

  it("decodes a valid { status, version } body", () => {
    const health = Schema.decodeSync(Health)({
      status: "ok",
      version: "1.4.0",
    });
    expect(health).toBeInstanceOf(Health);
    expect(health.version).toBe("1.4.0");
  });

  it.each(["status", "version"])("refuses a body without %s", (field) => {
    const body = Object.fromEntries(
      Object.entries({ status: "ok", version: "1.4.0" }).filter(
        ([name]) => name !== field,
      ),
    );
    expect(Exit.isFailure(decode(body))).toBe(true);
  });

  it("refuses a status other than ok", () => {
    expect(
      Exit.isFailure(decode({ status: "degraded", version: "1.4.0" })),
    ).toBe(true);
  });

  it("refuses an empty version, which the PWA could not display", () => {
    expect(Exit.isFailure(decode({ status: "ok", version: "" }))).toBe(true);
  });
});

// Follows a local `#/components/schemas/<name>` reference, if any.
function resolve(
  schema: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  const ref = schema?.["$ref"];
  if (typeof ref !== "string") return schema;
  const name = ref.replace("#/components/schemas/", "");
  return spec.components.schemas[name];
}
