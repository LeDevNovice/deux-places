import { Exit, Schema } from "effect";
import { OpenApi } from "effect/http-api";
import { describe, expect, it } from "vitest";
import { Api, Health, PushSubscriptionInput, Validation } from "./api";

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

// Plan J1.14; technique-v2 §6.1 (one group per context, commands are POST sub-resources), §6.2
// (a refused input is the `validation` problem, 400).
describe("API contract — the notifications group (plan J1.14)", () => {
  it.each([
    ["get", "/api/v1/push/public-key"],
    ["post", "/api/v1/push/subscriptions"],
    ["post", "/api/v1/push/test-notification"],
  ] as const)("declares %s %s in the notifications group", (method, path) => {
    expect(spec.paths[path]?.[method]?.tags).toEqual(["notifications"]);
  });

  it("answers GET /api/v1/push/public-key with a JSON body { publicKey }", () => {
    const body =
      spec.paths["/api/v1/push/public-key"]?.get?.responses["200"]?.content?.[
        "application/json"
      ]?.schema;
    expect(Object.keys(resolve(body)?.["properties"] ?? {})).toEqual([
      "publicKey",
    ]);
  });

  it("answers a subscription with 204, or with a 400 validation problem", () => {
    const responses =
      spec.paths["/api/v1/push/subscriptions"]?.post?.responses ?? {};
    expect(Object.keys(responses).toSorted()).toEqual(["204", "400"]);
    expect(Object.keys(responses["400"]?.content ?? {})).toEqual([
      "application/problem+json",
    ]);
  });

  it("answers the test notification request with 204 and declares no error", () => {
    const responses =
      spec.paths["/api/v1/push/test-notification"]?.post?.responses ?? {};
    expect(Object.keys(responses)).toEqual(["204"]);
  });
});

describe("Validation problem (technique-v2 §6.2)", () => {
  it("is type /problems/validation with status 400", () => {
    const problem = new Validation();
    expect(problem.type).toBe("/problems/validation");
    expect(problem.status).toBe(400);
  });
});

describe("PushSubscriptionInput — what the browser's PushSubscription.toJSON() gives", () => {
  const decode = Schema.decodeUnknownExit(PushSubscriptionInput);

  it("decodes { endpoint, keys: { p256dh, auth } } and ignores expirationTime", () => {
    const decoded = decode({
      endpoint: "https://push.example.test/send/1",
      expirationTime: null,
      keys: { p256dh: "BP4z", auth: "BTBZ" },
    });
    expect(decoded).toStrictEqual(
      Exit.succeed({
        endpoint: "https://push.example.test/send/1",
        keys: { p256dh: "BP4z", auth: "BTBZ" },
      }),
    );
  });

  it.each(["endpoint", "keys"])("refuses a body without %s", (field) => {
    const body = Object.fromEntries(
      Object.entries({
        endpoint: "https://push.example.test/send/1",
        keys: { p256dh: "BP4z", auth: "BTBZ" },
      }).filter(([name]) => name !== field),
    );
    expect(Exit.isFailure(decode(body))).toBe(true);
  });
});
