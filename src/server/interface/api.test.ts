import { Effect, Layer, Schema } from "effect";
import {
  beforeEach,
  describe,
  expect,
  it,
  type MockInstance,
  vi,
} from "vitest";
import { jsonLogs } from "../runtime/logging";
import { makeApiHandler } from "./api";

// Plan J1.8; technique-v2 §10.2 (built once), §12.1 (JSON logs, never personal data). The Worker
// always sends its request id in X-Request-Id (worker.ts); the household writes it on its line.
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

// Values a request may carry that §12.1 forbids in the logs: e-mail, token, secret, body, note.
const sensitive = {
  email: "alice@example.test",
  token: "magic-link-token-7f3a",
  session: "session-id-9c1e",
  secret: "fake-export-secret",
  note: "Une note à l'aveugle",
};

const health = (init?: RequestInit) =>
  new Request("https://deux-places.test/api/v1/health", init);

describe("household API — one JSON log line per request, with the Worker's request id", () => {
  let log: MockInstance;
  beforeEach(() => {
    log = vi.spyOn(console, "log").mockImplementation(() => {});
    return () => log.mockRestore();
  });

  it("writes one JSON line with the request id it received, the method, the path and the status", async () => {
    const handle = makeApiHandler(jsonLogs);

    const response = await handle(
      health({ headers: { "X-Request-Id": "id-from-the-worker" } }),
    );
    await response.text();

    const lines = linesOf(log);
    expect(lines).toHaveLength(1);
    expect(lines[0]?.level).toBe("INFO");
    expect(lines[0]?.annotations).toStrictEqual({
      requestId: "id-from-the-worker",
      "http.method": "GET",
      "http.url": "/api/v1/health",
      "http.status": 200,
    });
  });

  it("logs a route the API does not define, with its status", async () => {
    const handle = makeApiHandler(jsonLogs);

    const response = await handle(
      new Request("https://deux-places.test/api/v1/unknown", {
        headers: { "X-Request-Id": "id-from-the-worker" },
      }),
    );
    await response.text();

    expect(linesOf(log).map((line) => line.annotations)).toStrictEqual([
      {
        requestId: "id-from-the-worker",
        "http.method": "GET",
        "http.url": "/api/v1/unknown",
        "http.status": 404,
      },
    ]);
  });

  it("never writes an e-mail, a token, a session, a secret, the body or a note", async () => {
    const handle = makeApiHandler(jsonLogs);

    const response = await handle(
      new Request(
        `https://deux-places.test/api/v1/health?token=${sensitive.token}&email=${sensitive.email}`,
        {
          method: "POST",
          headers: {
            "X-Request-Id": "id-from-the-worker",
            Authorization: `Bearer ${sensitive.token}`,
            Cookie: `__Host-session=${sensitive.session}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            email: sensitive.email,
            note: sensitive.note,
          }),
        },
      ),
    );
    await response.text();

    const written = log.mock.calls.flat().map(String).join("\n");
    expect(linesOf(log)).toHaveLength(1);
    for (const value of Object.values(sensitive))
      expect(written).not.toContain(value);
  });

  it("builds its logger with the handler, once, not per request", async () => {
    let builds = 0;
    const handle = makeApiHandler(
      Layer.merge(
        jsonLogs,
        Layer.effectDiscard(Effect.sync(() => void (builds += 1))),
      ),
    );

    // One after the other: the lines must come in request order.
    const send = async (id: string) =>
      (await handle(health({ headers: { "X-Request-Id": id } }))).text();
    await send("first");
    await send("second");
    await send("third");

    expect(builds).toBe(1);
    expect(
      linesOf(log).map((line) => line.annotations["requestId"]),
    ).toStrictEqual(["first", "second", "third"]);
  });
});
