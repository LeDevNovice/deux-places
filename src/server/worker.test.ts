import { Effect, Layer, Schema } from "effect";
import {
  beforeEach,
  describe,
  expect,
  it,
  type MockInstance,
  vi,
} from "vitest";

// `cloudflare:workers` only exists inside workerd. Here the Durable Object classes the Worker
// re-exports only need a base class to extend; they run in the `workers` project.
vi.mock("cloudflare:workers", () => ({ DurableObject: Object }));

// Obviously fake values: the test never sees a real key. The VAPID pair must be a well-formed
// P-256 pair (J1.13): RFC 8291 §5's published sender pair, never a real key.
const secrets = {
  TMDB_API_KEY: "fake-tmdb-api-key",
  VAPID_PUBLIC_KEY:
    "BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8",
  VAPID_PRIVATE_KEY: "yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw", // gitleaks:allow (RFC 8291 §5)
  BREVO_API_KEY: "fake-brevo-api-key",
  EXPORT_SECRET: "fake-export-secret",
};

// Fake of the `Household` binding (an external border): it records which jurisdiction and which
// household each request asks for, and answers 200 for the object.
const fakeHouseholds = () => {
  const asked = {
    jurisdictions: [] as string[],
    households: [] as string[],
    forwarded: [] as Request[],
  };
  const namespace = {
    jurisdiction(jurisdiction: string) {
      asked.jurisdictions.push(jurisdiction);
      return namespace;
    },
    idFromName(name: string): DurableObjectId {
      asked.households.push(name);
      return {
        name,
        toString: () => name,
        equals: (other) => other.name === name,
      };
    },
    get(_id: DurableObjectId) {
      return {
        fetch(request: Request) {
          asked.forwarded.push(request);
          return Promise.resolve(new Response("from the household"));
        },
      };
    },
  };
  return { namespace, asked };
};

// Fake of the static-assets binding (an external border): it records the requests it serves and
// answers like the asset server, with the page and its own headers.
const fakeAssets = () => {
  const served: Request[] = [];
  const binding = {
    fetch(request: Request) {
      served.push(request);
      return Promise.resolve(
        new Response("<!doctype html><title>Deux Places</title>", {
          headers: { "Content-Type": "text/html", ETag: '"page"' },
        }),
      );
    },
  };
  return { binding, served };
};

const envWith = (
  values: Record<string, string>,
  households = fakeHouseholds().namespace,
  assets = fakeAssets().binding,
) => ({ ...values, Household: households, ASSETS: assets });

const env = envWith(secrets);
const request = new Request("https://deux-places.test/api/x");

// The configuration is built once per isolate (module state), so each test loads a fresh
// Worker module, as a new isolate would.
const freshWorker = async () => {
  vi.resetModules();
  return (await import("./worker")).default;
};

describe("worker — requests no route handles get a not-found problem (technique-v2 §6.2)", () => {
  let worker: Awaited<ReturnType<typeof freshWorker>>;
  beforeEach(async () => {
    worker = await freshWorker();
  });

  it("answers 404", async () => {
    const response = await worker.fetch(request, env);

    expect(response.status).toBe(404);
  });

  it("is an RFC 9457 problem document", async () => {
    const response = await worker.fetch(request, env);

    expect(response.headers.get("Content-Type")).toBe(
      "application/problem+json",
    );
  });

  it("carries the not-found type, a title and the same status, and no instance yet", async () => {
    const response = await worker.fetch(request, env);

    expect(await response.json()).toStrictEqual({
      type: "/problems/not-found",
      title: "Not Found",
      status: 404,
    });
  });
});

describe("worker — configuration validated at startup (technique-v2 §10.1, §10.2)", () => {
  it("answers a 500 problem without detail when a secret is missing", async () => {
    const worker = await freshWorker();
    const { EXPORT_SECRET: _missing, ...incomplete } = secrets;
    vi.spyOn(console, "log").mockImplementation(() => {});

    const response = await worker.fetch(request, envWith(incomplete));

    vi.restoreAllMocks();
    expect(response.status).toBe(500);
    expect(response.headers.get("Content-Type")).toBe(
      "application/problem+json",
    );
    expect(await response.json()).toStrictEqual({
      type: "about:blank",
      title: "Internal Server Error",
      status: 500,
    });
  });

  it("builds the configuration once, not on every request", async () => {
    const worker = await freshWorker();
    const reads = new Map<PropertyKey, number>();
    const counted = new Proxy(env, {
      get(target, key, receiver) {
        reads.set(key, (reads.get(key) ?? 0) + 1);
        return Reflect.get(target, key, receiver);
      },
    });

    await worker.fetch(request, counted);
    const afterFirst = reads.get("TMDB_API_KEY");
    await worker.fetch(request, counted);

    expect(afterFirst).toBeGreaterThan(0);
    expect(reads.get("TMDB_API_KEY")).toBe(afterFirst);
  });
});

describe("worker — /api/v1/* goes to the fixed development household (plan J1.6, technique-v2 §4.2, §10.1)", () => {
  const health = new Request("https://deux-places.test/api/v1/health");

  it("forwards the request to the household and returns the household's response", async () => {
    const { namespace, asked } = fakeHouseholds();

    const response = await (
      await freshWorker()
    ).fetch(health, envWith(secrets, namespace));

    expect(asked.forwarded.map((forwarded) => forwarded.url)).toStrictEqual([
      health.url,
    ]);
    expect(await response.text()).toBe("from the household");
  });

  it("reaches the household through the EU jurisdiction by default", async () => {
    const { namespace, asked } = fakeHouseholds();

    await (await freshWorker()).fetch(health, envWith(secrets, namespace));

    expect(asked.jurisdictions).toStrictEqual(["eu"]);
  });

  it("reaches it through the EU jurisdiction when DURABLE_OBJECT_JURISDICTION is eu", async () => {
    const { namespace, asked } = fakeHouseholds();
    const values = { ...secrets, DURABLE_OBJECT_JURISDICTION: "eu" };

    await (await freshWorker()).fetch(health, envWith(values, namespace));

    expect(asked.jurisdictions).toStrictEqual(["eu"]);
  });

  it("reaches it without a jurisdiction only when DURABLE_OBJECT_JURISDICTION is none (local runs)", async () => {
    const { namespace, asked } = fakeHouseholds();
    const values = { ...secrets, DURABLE_OBJECT_JURISDICTION: "none" };

    await (await freshWorker()).fetch(health, envWith(values, namespace));

    expect(asked.jurisdictions).toStrictEqual([]);
    expect(asked.forwarded.map((forwarded) => forwarded.url)).toStrictEqual([
      health.url,
    ]);
  });

  it("sends every /api/v1/* request to the same household", async () => {
    const { namespace, asked } = fakeHouseholds();
    const worker = await freshWorker();
    const values = envWith(secrets, namespace);

    await worker.fetch(health, values);
    await worker.fetch(
      new Request("https://deux-places.test/api/v1/unknown"),
      values,
    );

    expect(asked.households).toHaveLength(2);
    expect(asked.households[1]).toBe(asked.households[0]);
  });

  it("answers the 500 problem and forwards nothing when the configuration is refused", async () => {
    const { namespace, asked } = fakeHouseholds();
    const { EXPORT_SECRET: _missing, ...incomplete } = secrets;
    vi.spyOn(console, "log").mockImplementation(() => {});

    const response = await (
      await freshWorker()
    ).fetch(health, envWith(incomplete, namespace));

    vi.restoreAllMocks();
    expect(response.status).toBe(500);
    expect(asked.forwarded).toStrictEqual([]);
  });

  it.each(["/api/x", "/api/v1", "/api/v2/health"])(
    "keeps the not-found problem for %s, outside /api/v1/*, and forwards nothing",
    async (path) => {
      const { namespace, asked } = fakeHouseholds();

      const response = await (
        await freshWorker()
      ).fetch(
        new Request(`https://deux-places.test${path}`),
        envWith(secrets, namespace),
      );

      expect(response.status).toBe(404);
      expect(asked.forwarded).toStrictEqual([]);
    },
  );
});

// Plan J1.8: every request but the hashed bundles reaches the Worker (wrangler.jsonc), which serves
// pages through the static-assets binding, as the asset server did before.
describe("worker — pages are served from the static assets (plan J1.8)", () => {
  // Before J1.8 pages never reached the Worker: they need no configuration, and still load.
  it("serves pages even when the configuration is refused", async () => {
    const { EXPORT_SECRET: _missing, ...incomplete } = secrets;
    const assets = fakeAssets();

    const response = await (
      await freshWorker()
    ).fetch(
      new Request("https://deux-places.test/"),
      envWith(incomplete, fakeHouseholds().namespace, assets.binding),
    );

    expect(response.status).toBe(200);
    expect(assets.served).toHaveLength(1);
  });

  it.each(["/", "/reserve", "/apiv1/health", "/api"])(
    "serves %s from the static assets, outside /api/, and forwards nothing to a household",
    async (path) => {
      const households = fakeHouseholds();
      const assets = fakeAssets();
      const page = new Request(`https://deux-places.test${path}`);

      const response = await (
        await freshWorker()
      ).fetch(page, envWith(secrets, households.namespace, assets.binding));

      expect(assets.served.map((served) => served.url)).toStrictEqual([
        page.url,
      ]);
      expect(households.asked.forwarded).toStrictEqual([]);
      expect(response.status).toBe(200);
      expect(response.headers.get("Content-Type")).toBe("text/html");
      expect(response.headers.get("ETag")).toBe('"page"');
      expect(await response.text()).toBe(
        "<!doctype html><title>Deux Places</title>",
      );
    },
  );
});

// technique-v2 §13.3, copied directive by directive; directive order carries no meaning.
const policyOf13_3 = {
  "default-src": ["'self'"],
  "img-src": ["'self'", "https://image.tmdb.org", "data:"],
  "connect-src": ["'self'"],
  "object-src": ["'none'"],
  "base-uri": ["'none'"],
  "frame-ancestors": ["'none'"],
};

// Reads a Content-Security-Policy header into { directive: sources }; null when it is absent.
const policyOf = (response: Response) => {
  const header = response.headers.get("Content-Security-Policy");
  if (header === null) return null;
  return Object.fromEntries(
    header
      .split(";")
      .map((directive) => directive.trim().split(/\s+/))
      .filter(([name]) => name !== "")
      .map(([name, ...sources]) => [name, sources]),
  );
};

// Response headers a fake answered with, plus the one §13.3 adds.
const headerNames = (response: Response) =>
  [...response.headers.keys()].toSorted();

describe("worker — security headers of technique-v2 §13.3 on pages and API responses (plan J1.8)", () => {
  it("puts the §13.3 Content-Security-Policy on / and adds no other header", async () => {
    const response = await (
      await freshWorker()
    ).fetch(new Request("https://deux-places.test/"), env);

    expect(policyOf(response)).toStrictEqual(policyOf13_3);
    expect(headerNames(response)).toStrictEqual([
      "content-security-policy",
      "content-type",
      "etag",
    ]);
  });

  it("puts it on /api/v1/health, answered by the household, and adds no other header", async () => {
    const response = await (
      await freshWorker()
    ).fetch(new Request("https://deux-places.test/api/v1/health"), env);

    expect(await response.text()).toBe("from the household");
    expect(policyOf(response)).toStrictEqual(policyOf13_3);
    expect(headerNames(response)).toStrictEqual([
      "content-security-policy",
      "content-type",
    ]);
  });

  it("puts it on the not-found problem", async () => {
    const response = await (await freshWorker()).fetch(request, env);

    expect(response.status).toBe(404);
    expect(policyOf(response)).toStrictEqual(policyOf13_3);
  });

  it("puts it on the 500 problem of a refused configuration", async () => {
    const { EXPORT_SECRET: _missing, ...incomplete } = secrets;
    vi.spyOn(console, "log").mockImplementation(() => {});

    const response = await (
      await freshWorker()
    ).fetch(request, envWith(incomplete));

    vi.restoreAllMocks();
    expect(response.status).toBe(500);
    expect(policyOf(response)).toStrictEqual(policyOf13_3);
  });
});

// One line of Effect's JSON logger: the fields the tests read.
const LogLine = Schema.Struct({
  level: Schema.String,
  annotations: Schema.Record(Schema.String, Schema.Unknown),
});

// Each call of the spy is one line written by Effect's console logger.
const linesOf = (log: MockInstance) =>
  log.mock.calls.map(([line]) =>
    Schema.decodeUnknownSync(LogLine)(JSON.parse(String(line))),
  );

// crypto.randomUUID() (decision recorded in the J1.8 commit).
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

// Values a request may carry that §12.1 forbids in the logs: e-mail, token, secret, body, note.
const sensitive = {
  email: "alice@example.test",
  token: "magic-link-token-7f3a",
  session: "session-id-9c1e",
  secret: "fake-export-secret",
  note: "Une note à l'aveugle",
};

const sensitiveRequest = (path: string) =>
  new Request(
    `https://deux-places.test${path}?token=${sensitive.token}&email=${sensitive.email}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${sensitive.token}`,
        Cookie: `__Host-session=${sensitive.session}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email: sensitive.email, note: sensitive.note }),
    },
  );

describe("worker — one JSON log line per request, with a request id (plan J1.8, technique-v2 §12.1)", () => {
  let log: MockInstance;
  beforeEach(() => {
    log = vi.spyOn(console, "log").mockImplementation(() => {});
    return () => log.mockRestore();
  });

  it("writes one JSON line with a request id, the method, the path and the status", async () => {
    await (
      await freshWorker()
    ).fetch(new Request("https://deux-places.test/api/x"), env);

    const lines = linesOf(log);
    expect(lines).toHaveLength(1);
    const [line] = lines;
    expect(line?.level).toBe("INFO");
    expect(line?.annotations).toMatchObject({
      "http.method": "GET",
      "http.url": "/api/x",
      "http.status": 404,
    });
    expect(line?.annotations["requestId"]).toMatch(uuid);
  });

  // A page path may carry a credential: the invitation link is /i/7K2-QX9 (technique-v2 §9.3),
  // a code stored only hashed (§7.1). Pages are logged without their path.
  it("logs pages without their path, which may carry an invitation code", async () => {
    await (
      await freshWorker()
    ).fetch(new Request("https://deux-places.test/i/7K2-QX9"), env);

    const written = log.mock.calls.flat().map(String).join("\n");
    expect(written).not.toContain("7K2-QX9");
    expect(linesOf(log).map((line) => line.annotations)).toStrictEqual([
      {
        requestId: expect.stringMatching(uuid),
        "http.method": "GET",
        "http.status": 200,
      },
    ]);
  });

  it("gives two requests two different request ids", async () => {
    const worker = await freshWorker();

    await worker.fetch(new Request("https://deux-places.test/"), env);
    await worker.fetch(new Request("https://deux-places.test/"), env);

    const [first, second] = linesOf(log).map(
      (line) => line.annotations["requestId"],
    );
    expect(first).toMatch(uuid);
    expect(second).toMatch(uuid);
    expect(second).not.toBe(first);
  });

  it("sends its request id to the household, in place of any id the phone sent", async () => {
    const { namespace, asked } = fakeHouseholds();
    const fromThePhone = new Request("https://deux-places.test/api/v1/health", {
      headers: { "X-Request-Id": "chosen-by-the-phone" },
    });

    await (
      await freshWorker()
    ).fetch(fromThePhone, envWith(secrets, namespace));

    const [line] = linesOf(log);
    const [forwarded] = asked.forwarded;
    expect(forwarded?.url).toBe(fromThePhone.url);
    expect(forwarded?.method).toBe("GET");
    expect(forwarded?.headers.get("X-Request-Id")).toBe(
      line?.annotations["requestId"],
    );
    expect(line?.annotations["requestId"]).toMatch(uuid);
  });

  it("forwards the body to the household unchanged", async () => {
    const { namespace, asked } = fakeHouseholds();

    await (
      await freshWorker()
    ).fetch(sensitiveRequest("/api/v1/health"), envWith(secrets, namespace));

    expect(await asked.forwarded[0]?.json()).toStrictEqual({
      email: sensitive.email,
      note: sensitive.note,
    });
  });

  it.each([
    ["/api/v1/health", "/api/v1/health"],
    ["/api/x", "/api/x"],
    ["/", undefined],
  ])(
    "never writes an e-mail, a token, a session, a secret, the body or a note (%s)",
    async (path, loggedPath) => {
      await (await freshWorker()).fetch(sensitiveRequest(path), env);

      const written = log.mock.calls.flat().map(String).join("\n");
      expect(linesOf(log)).toHaveLength(1);
      for (const value of Object.values(sensitive))
        expect(written).not.toContain(value);
      expect(linesOf(log)[0]?.annotations["http.url"]).toBe(loggedPath);
    },
  );

  it("builds its logger once per isolate, not per request", async () => {
    vi.resetModules();
    const logging = await import("./runtime/logging");
    const real = logging.jsonLogs;
    let builds = 0;
    const counted = vi
      .spyOn(logging, "jsonLogs", "get")
      .mockReturnValue(
        Layer.merge(
          real,
          Layer.effectDiscard(Effect.sync(() => void (builds += 1))),
        ),
      );
    try {
      const worker = (await import("./worker")).default;
      const page = new Request("https://deux-places.test/");

      await worker.fetch(page, env);
      const afterFirst = builds;
      await worker.fetch(page, env);
      await worker.fetch(page, env);

      expect(afterFirst).toBeGreaterThan(0);
      expect(builds).toBe(afterFirst);
      expect(linesOf(log)).toHaveLength(3);
    } finally {
      counted.mockRestore();
    }
  });
});
