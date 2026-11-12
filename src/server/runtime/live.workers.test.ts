import { evictDurableObject, runInDurableObject } from "cloudflare:test";
import { env, exports } from "cloudflare:workers";
import { Schema } from "effect";
import { describe, expect, it, vi } from "vitest";
import { Household } from "./household";
import * as live from "./live";
import * as migrations from "./migrations";

// Plan J1.11; technique-v2 §6.3 (WebSocket hiberné, sens unique, veille), §13.3 (`Origin` vérifié à
// l'ouverture). Requests go through the Worker, which sends /api/v1/* to the development household.
const livePath = "https://deux-places.test/api/v1/live";
// The page's own origin: the PWA and the API share it (§13.3, `connect-src 'self'`).
const sameOrigin = "https://deux-places.test";

const openRequest = (headers: Record<string, string>) =>
  exports.default.fetch(livePath, { headers });

// The fixed household every /api/v1/* request reaches until J3.6 (plan J1.6). Local workerd has
// no jurisdictions: the tests run with DURABLE_OBJECT_JURISDICTION=none.
const developmentHousehold = () =>
  env.Household.get(env.Household.idFromName("development"));

// Opens a live connection as the PWA would, and accepts the client end in the test.
const connect = async () => {
  const response = await openRequest({
    Upgrade: "websocket",
    Origin: sameOrigin,
  });
  const socket = response.webSocket;
  if (socket === null)
    throw new Error(
      `no WebSocket: ${response.status} ${await response.text()}`,
    );
  socket.accept();
  return socket;
};

// The next message the client receives, or "no message" if none arrives within the delay.
const nextMessage = (socket: WebSocket, withinMs = 2000) =>
  new Promise<unknown>((resolve) => {
    const timer = setTimeout(() => resolve("no message"), withinMs);
    socket.addEventListener(
      "message",
      (event) => {
        clearTimeout(timer);
        resolve(event.data);
      },
      { once: true },
    );
  });

// The close code the client sees, or "still open" if nothing closes it within the delay.
const closeCode = (socket: WebSocket, withinMs = 2000) =>
  new Promise<number | "still open">((resolve) => {
    const timer = setTimeout(() => resolve("still open"), withinMs);
    socket.addEventListener(
      "close",
      (event) => {
        clearTimeout(timer);
        resolve(event.code);
      },
      { once: true },
    );
  });

const broadcastFromHousehold = (message: string) =>
  runInDurableObject(developmentHousehold(), (_instance, state) =>
    live.broadcast(state, message),
  );

describe("live in the Workers runtime — /api/v1/live opens a WebSocket on the household (technique-v2 §6.3)", () => {
  it("answers 101 with a WebSocket to an upgrade request from the page's own origin", async () => {
    const response = await openRequest({
      Upgrade: "websocket",
      Origin: sameOrigin,
    });

    expect(response.status).toBe(101);
    expect(response.webSocket).not.toBeNull();
    response.webSocket?.accept();
    response.webSocket?.close();
  });

  // The line's verification: two connected clients receive the same message.
  it("delivers one broadcast message to both of two connected clients", async () => {
    const first = await connect();
    const second = await connect();
    try {
      const received = [nextMessage(first), nextMessage(second)];

      await broadcastFromHousehold('{"probe":"two clients"}');

      expect(await Promise.all(received)).toStrictEqual([
        '{"probe":"two clients"}',
        '{"probe":"two clients"}',
      ]);
    } finally {
      first.close();
      second.close();
    }
  });

  it("reaches only the connections still open: one closed by its phone, one closed by the household, block nothing", async () => {
    const closedByPhone = await connect();
    const closedByHousehold = await connect();
    const open = await connect();
    try {
      const householdClosed = closeCode(closedByHousehold);
      closedByHousehold.send('{"command":"vote"}');
      expect(await householdClosed).toBe(1008);
      const phoneClosed = closeCode(closedByPhone);
      closedByPhone.close(1000);
      expect(await phoneClosed).toBe(1000);
      const received = nextMessage(open);
      const late = nextMessage(closedByPhone, 500);

      await broadcastFromHousehold('{"probe":"after closures"}');

      expect(await received).toBe('{"probe":"after closures"}');
      expect(await late).toBe("no message");
    } finally {
      open.close();
    }
  });
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

// §13.3: `Origin` is checked when the WebSocket opens. The site's address is only chosen at
// checkpoint A (ADR-017), so the accepted origin is the request's own (decision in the commit). A
// browser always sends `Origin` when it opens a WebSocket: an opening without it is refused too.
describe("live in the Workers runtime — the opening checks Origin (technique-v2 §13.3)", () => {
  it.each([
    ["another site", { Origin: "https://elsewhere.test" }],
    ["the same host over http", { Origin: "http://deux-places.test" }],
    ["another port", { Origin: "https://deux-places.test:8443" }],
    ["an opaque origin", { Origin: "null" }],
    ["no Origin header", {}],
  ])(
    "refuses an opening from %s: 403 problem, no WebSocket, the §13.3 policy",
    async (_case, origin: Record<string, string>) => {
      const response = await openRequest({ Upgrade: "websocket", ...origin });

      expect(response.status).toBe(403);
      expect(response.webSocket).toBeNull();
      expect(response.headers.get("Content-Type")).toBe(
        "application/problem+json",
      );
      // RFC 9457 §4.2.1: with `about:blank`, the title is the status phrase.
      expect(await response.json()).toStrictEqual({
        type: "about:blank",
        title: "Forbidden",
        status: 403,
      });
      expect(policyOf(response)).toStrictEqual(policyOf13_3);
    },
  );
});

// /api/v1/live is a WebSocket only. RFC 9110 §15.5.22: a 426 names the protocol to switch to in
// `Upgrade`. RFC 6455 §4.2.1: the `websocket` token is case-insensitive.
describe("live in the Workers runtime — /api/v1/live only opens WebSockets", () => {
  it.each([
    ["no Upgrade header", {}],
    ["an upgrade to another protocol", { Upgrade: "h2c" }],
  ])(
    "answers %s with a 426 problem naming websocket, and no WebSocket",
    async (_case, upgrade: Record<string, string>) => {
      const response = await openRequest({ Origin: sameOrigin, ...upgrade });

      expect(response.status).toBe(426);
      expect(response.webSocket).toBeNull();
      expect(response.headers.get("Upgrade")).toBe("websocket");
      expect(response.headers.get("Content-Type")).toBe(
        "application/problem+json",
      );
      expect(await response.json()).toStrictEqual({
        type: "about:blank",
        title: "Upgrade Required",
        status: 426,
      });
      expect(policyOf(response)).toStrictEqual(policyOf13_3);
    },
  );

  // workerd lowers the token before the object reads it: this guards the behaviour, not a branch.
  it("opens it when the Upgrade token is written in another case", async () => {
    const response = await openRequest({
      Upgrade: "WebSocket",
      Origin: sameOrigin,
    });

    expect(response.status).toBe(101);
    response.webSocket?.accept();
    response.webSocket?.close();
  });
});

// A connection the household closes stays in `getWebSockets()` until its phone answers the Close
// frame (fresh-context review of J1.11); a slow or offline phone may never answer.
describe("live in the Workers runtime — a broadcast skips a connection the household is closing", () => {
  it("reaches the two open connections when it runs before the closed phone has answered", async () => {
    const stub = env.Household.get(env.Household.idFromName("live-closing"));
    const open = async () => {
      const response = await stub.fetch(livePath, {
        headers: { Upgrade: "websocket", Origin: sameOrigin },
      });
      const socket = response.webSocket;
      if (socket === null) throw new Error(`no WebSocket: ${response.status}`);
      socket.accept();
      return socket;
    };
    const sockets = [await open(), await open(), await open()];
    try {
      const seen = sockets.map((socket) =>
        Promise.race([nextMessage(socket), closeCode(socket)]),
      );

      await runInDurableObject(stub, (_instance, state) => {
        state.getWebSockets()[0]?.close(1008, "closing");
        live.broadcast(state, '{"probe":"while closing"}');
      });

      // One client sees its close, the two others the message; which one is closed is not known.
      const outcomes = await Promise.all(seen);
      expect(outcomes).toHaveLength(3);
      expect(outcomes.filter((outcome) => outcome === 1008)).toHaveLength(1);
      expect(
        outcomes.filter((outcome) => outcome === '{"probe":"while closing"}'),
      ).toHaveLength(2);
    } finally {
      for (const socket of sockets) socket.close();
    }
  });
});

// §6.3, ADR-019: while asleep the object is out of memory and its WebSockets stay connected; the
// ping is answered without waking it, and a broadcast after it wakes reaches the same connections.
// `evictDurableObject` hibernates WebSockets by default (@cloudflare/vitest-plugin types). A start
// is observed through `migrateHousehold`, which only the object's constructor calls (J1.7).
describe("live in the Workers runtime — connections survive the object's hibernation (technique-v2 §6.3)", () => {
  it("answers the ping while the object is evicted, then reaches both connections from the woken object", async () => {
    const stub = env.Household.get(
      env.Household.idFromName("live-hibernation"),
    );
    const open = async () => {
      const response = await stub.fetch(livePath, {
        headers: { Upgrade: "websocket", Origin: sameOrigin },
      });
      const socket = response.webSocket;
      if (socket === null) throw new Error(`no WebSocket: ${response.status}`);
      socket.accept();
      return socket;
    };
    const first = await open();
    const second = await open();
    const starts = vi.spyOn(migrations, "migrateHousehold");
    try {
      await evictDurableObject(stub);

      const pong = nextMessage(first);
      first.send("ping");
      expect(await pong).toBe("pong");
      expect(starts).not.toHaveBeenCalled();

      const received = [nextMessage(first), nextMessage(second)];
      const reached = await runInDurableObject(stub, (_instance, state) => {
        live.broadcast(state, '{"probe":"after hibernation"}');
        return state.getWebSockets().length;
      });

      expect(starts).toHaveBeenCalledTimes(1);
      expect(reached).toBe(2);
      expect(await Promise.all(received)).toStrictEqual([
        '{"probe":"after hibernation"}',
        '{"probe":"after hibernation"}',
      ]);
    } finally {
      starts.mockRestore();
      first.close();
      second.close();
    }
  });
});

// RFC 6455 §5.5.1: the endpoint receiving a Close frame sends one back. The Cloudflare docs say the
// runtime does it for hibernated WebSockets from compatibility date 2026-04-07; workerd 1.20261103.1
// does not (probe recorded in PROGRESS, J1.11), so the household answers it.
describe("live in the Workers runtime — a phone that closes its connection gets the close back", () => {
  it.each([
    ["a normal closure", 1000],
    ["an application code", 4000],
  ])("completes the closing handshake for %s", async (_case, code) => {
    const socket = await connect();
    const closed = closeCode(socket);

    socket.close(code, "bye");

    expect(await closed).toBe(code);
  });

  // Without a code the household sees 1005 (RFC 6455 §7.1.5), a code no endpoint may send.
  it("completes it when the phone closes without a code", async () => {
    const socket = await connect();
    const closed = closeCode(socket);

    socket.close();

    expect(await closed).toBe(1005);
  });
});

// One line of Effect's JSON logger: the field the test reads.
const LogLine = Schema.Struct({
  annotations: Schema.Record(Schema.String, Schema.Unknown),
});

// Plan J1.8, technique-v2 §12.1: the Worker writes one JSON line per request, the opening included.
describe("live in the Workers runtime — the opening is logged like any request (technique-v2 §12.1)", () => {
  it("writes the Worker's JSON line for GET /api/v1/live with status 101", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      const socket = await connect();
      socket.close();

      const annotations = log.mock.calls.map(
        ([line]) =>
          Schema.decodeUnknownSync(LogLine)(JSON.parse(String(line)))
            .annotations,
      );
      expect(annotations).toContainEqual(
        expect.objectContaining({
          "http.method": "GET",
          "http.url": "/api/v1/live",
          "http.status": 101,
        }),
      );
    } finally {
      log.mockRestore();
    }
  });
});

// §6.3: the server pushes, the phone never commands through the WebSocket. 1008 is the RFC 6455
// "policy violation" close code.
describe("live in the Workers runtime — the connection is server → phone only (technique-v2 §6.3)", () => {
  it("closes with 1008 a connection whose phone sends anything but the ping", async () => {
    const socket = await connect();
    const closed = closeCode(socket);

    socket.send('{"command":"vote"}');

    expect(await closed).toBe(1008);
  });
});

// §6.3 "Veille": the platform answers the ping without waking the object. The strings are the ones
// the PWA client of J2.7 will send and expect (decision recorded in the J1.11 commit).
describe("live in the Workers runtime — the ping is answered by the platform (technique-v2 §6.3)", () => {
  it("answers ping with pong without calling the object's webSocketMessage, and keeps the connection", async () => {
    const delivered = vi.spyOn(Household.prototype, "webSocketMessage");
    const socket = await connect();
    try {
      const reply = nextMessage(socket);
      const closed = closeCode(socket, 500);

      socket.send("ping");

      expect(await reply).toBe("pong");
      expect(await closed).toBe("still open");
      expect(delivered).not.toHaveBeenCalled();
    } finally {
      delivered.mockRestore();
      socket.close();
    }
  });
});
