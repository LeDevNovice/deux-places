/// <reference types="@cloudflare/vitest-plugin/types" />
import { SqliteClient } from "@effect/sql-sqlite-do";
import {
  evictDurableObject,
  runDurableObjectAlarm,
  runInDurableObject,
} from "cloudflare:test";
import { env } from "cloudflare:workers";
import { Clock, DateTime, Effect, Layer, Scheduler } from "effect";
import { SqlClient } from "effect/sql";
import { TestClock } from "effect/testing";
import { describe, expect, it, vi } from "vitest";
import type {
  DomainEvent,
  RecordedDomainEvent,
} from "../../shared-kernel/domain-event";
import * as deadlines from "./deadlines";
import { Deadlines, type DeadlineExecutors } from "./deadlines";
import { restoreHousehold } from "./import";
import * as events from "./domain-events";
import {
  DomainEvents,
  type EventReaction,
  type EventReactions,
} from "./domain-events";

// Plan J2.4; technique-v2 §5.4 (the event is written in the command's transaction; after commit
// the object sends it to the open WebSockets and calls the internal reactions; on restart it
// resumes the events not handled, with one `handled_at` marker per reaction), §6.3 (WebSocket,
// public events with their sequence number, `?since=` replay), §7.1 (`domain_events`,
// `event_reactions`, increasing sequence; instants in UTC milliseconds), §11.4.

// Local workerd has no jurisdictions: the tests run with DURABLE_OBJECT_JURISDICTION=none.
const household = (name: string) =>
  env.Household.get(env.Household.idFromName(name));

const T0 = DateTime.toEpochMillis(DateTime.makeUnsafe("2031-03-01T20:00:00Z"));

// Test kinds: no module emits an event yet, and none of these reaches production code.
const happened = (
  n: number,
  audience: DomainEvent["audience"] = "household",
): DomainEvent => ({ kind: "test.happened", audience, payload: { n } });

// Runs `effect` inside the household's object, on its SQLite storage, with the household's events
// as `reactions` subscribe to them and the household's clock at `now`.
const inHousehold = <A, E>(
  stub: DurableObjectStub,
  effect: Effect.Effect<
    A,
    E,
    SqlClient.SqlClient | Layer.Success<ReturnType<typeof events.layer>>
  >,
  reactions: EventReactions = {},
  now = T0,
) =>
  runInDurableObject(stub, (_instance, state) =>
    Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const clock = yield* TestClock.make();
          yield* clock.setTime(now);
          return yield* effect.pipe(Effect.provideService(Clock.Clock, clock));
        }),
      ).pipe(
        Effect.provide(
          events
            .layer(reactions)
            .pipe(
              Layer.provideMerge(
                SqliteClient.layer({ storage: state.storage }),
              ),
            ),
        ),
      ),
    ),
  );

// A command: its events are written in one transaction.
const command = (...appended: readonly DomainEvent[]) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const domainEvents = yield* DomainEvents;
    return yield* sql.withTransaction(
      Effect.forEach(appended, (event) => domainEvents.append(event)),
    );
  });

const table = (stub: DurableObjectStub, query: string) =>
  runInDurableObject(stub, (_instance, state) =>
    state.storage.sql.exec(query).toArray(),
  );
const storedEvents = (stub: DurableObjectStub) =>
  table(
    stub,
    "SELECT sequence, kind, audience, occurred_at, payload FROM domain_events ORDER BY sequence",
  );
const reactionRows = (stub: DurableObjectStub) =>
  table(
    stub,
    "SELECT reaction, sequence, handled_at FROM event_reactions ORDER BY sequence, reaction",
  );

const noReaction = () => Effect.void;

describe("DomainEvents in the Workers runtime — an event is written in the command's transaction", () => {
  it("numbers the events from 1, with their kind, audience, payload and the instant Clock reads", async () => {
    const stub = household("events-append");

    const sequences = await inHousehold(
      stub,
      command(happened(1), happened(2, "internal")),
    );

    expect(sequences).toStrictEqual([1, 2]);
    expect(await storedEvents(stub)).toStrictEqual([
      {
        sequence: 1,
        kind: "test.happened",
        audience: "household",
        occurred_at: T0,
        payload: '{"n":1}',
      },
      {
        sequence: 2,
        kind: "test.happened",
        audience: "internal",
        occurred_at: T0,
        payload: '{"n":2}',
      },
    ]);
  });

  it("writes one pending marker per reaction that subscribes to its kind, and none for the others", async () => {
    const stub = household("events-append-reactions");
    const reactions: EventReactions = {
      souvenir: { kinds: ["test.happened"], react: noReaction },
      push: { kinds: ["test.happened", "test.other"], react: noReaction },
      unrelated: { kinds: ["test.other"], react: noReaction },
    };

    await inHousehold(stub, command(happened(1)), reactions);

    expect(await reactionRows(stub)).toStrictEqual([
      { reaction: "push", sequence: 1, handled_at: null },
      { reaction: "souvenir", sequence: 1, handled_at: null },
    ]);
  });
});

class CommandFailed {
  readonly _tag = "CommandFailed";
}

// A command that writes its state (here a deadline row), appends its event, then fails.
const failingCommand = (event: DomainEvent) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const domainEvents = yield* DomainEvents;
    return yield* sql.withTransaction(
      Effect.gen(function* () {
        yield* sql`INSERT INTO deadlines (kind, subject, due_at) VALUES ('test.state', 'a', 1)`;
        yield* domainEvents.append(event);
        return yield* Effect.fail(new CommandFailed());
      }),
    );
  });

describe("DomainEvents in the Workers runtime — a command that fails writes no event", () => {
  it("leaves neither its state, nor its event, nor its markers, and the next event takes the number", async () => {
    const stub = household("events-rollback");
    const reactions: EventReactions = {
      souvenir: { kinds: ["test.happened"], react: noReaction },
    };

    const failure = await inHousehold(
      stub,
      Effect.flip(failingCommand(happened(1))),
      reactions,
    );

    expect(failure).toBeInstanceOf(CommandFailed);
    expect(await table(stub, "SELECT * FROM deadlines")).toStrictEqual([]);
    expect(await storedEvents(stub)).toStrictEqual([]);
    expect(await reactionRows(stub)).toStrictEqual([]);
    expect(
      await inHousehold(stub, command(happened(2)), reactions),
    ).toStrictEqual([1]);
  });
});

// The page's own origin (§13.3), required to open the live connection (J1.11).
const origin = "https://deux-places.test";

// Opens a live connection on the household, as the PWA would, and collects what it receives.
const connect = async (stub: DurableObjectStub, query = "") => {
  const response = await stub.fetch(`${origin}/api/v1/live${query}`, {
    headers: { Upgrade: "websocket", Origin: origin },
  });
  const socket = response.webSocket;
  if (socket === null)
    throw new Error(
      `no WebSocket: ${response.status} ${await response.text()}`,
    );
  const received: unknown[] = [];
  socket.addEventListener("message", (event) =>
    received.push(JSON.parse(String(event.data))),
  );
  socket.accept();
  return { socket, received };
};

// Lets the messages already sent reach the test's end of the sockets.
const settled = () => new Promise((resolve) => setTimeout(resolve, 100));

const sent = (n: number, sequence: number) => ({
  type: "event",
  sequence,
  kind: "test.happened",
  payload: { n },
});

// Sends the household's committed events to its open connections, as the object does once an
// invocation's work is done.
const publish = (stub: DurableObjectStub) =>
  runInDurableObject(stub, (_instance, state) =>
    Effect.runPromise(
      events
        .publish(state)
        .pipe(
          Effect.provide(
            events
              .layer({})
              .pipe(
                Layer.provideMerge(
                  SqliteClient.layer({ storage: state.storage }),
                ),
              ),
          ),
        ),
    ),
  );

describe("DomainEvents in the Workers runtime — committed events reach the open connections", () => {
  it("sends the household's events to every open connection, in order, with their sequence, never an internal one", async () => {
    const stub = household("events-publish");
    const first = await connect(stub);
    const second = await connect(stub);
    try {
      await inHousehold(
        stub,
        command(happened(1), happened(2, "internal"), happened(3)),
      );
      await settled();
      expect(first.received).toStrictEqual([]);

      await publish(stub);
      await settled();

      expect(first.received).toStrictEqual([sent(1, 1), sent(3, 3)]);
      expect(second.received).toStrictEqual([sent(1, 1), sent(3, 3)]);
    } finally {
      first.socket.close();
      second.socket.close();
    }
  });

  it("sends each event once to a connection, however often it publishes", async () => {
    const stub = household("events-publish-once");
    const phone = await connect(stub);
    try {
      await inHousehold(stub, command(happened(1)));
      await publish(stub);
      await publish(stub);
      await inHousehold(stub, command(happened(2)));
      await publish(stub);
      await settled();

      expect(phone.received).toStrictEqual([sent(1, 1), sent(2, 2)]);
    } finally {
      phone.socket.close();
    }
  });

  it("sends each event once, in order, when two invocations publish at the same time and interleave", async () => {
    const stub = household("events-publish-concurrent");
    const phone = await connect(stub);
    try {
      await inHousehold(stub, command(happened(1), happened(2), happened(3)));

      await runInDurableObject(stub, (_instance, state) =>
        Effect.runPromise(
          Effect.all([events.publish(state), events.publish(state)], {
            concurrency: "unbounded",
          }).pipe(
            // The two publications yield to each other after every operation.
            Effect.provideService(Scheduler.MaxOpsBeforeYield, 20),
            Effect.provide(
              events
                .layer({})
                .pipe(
                  Layer.provideMerge(
                    SqliteClient.layer({ storage: state.storage }),
                  ),
                ),
            ),
          ),
        ),
      );
      await settled();

      expect(phone.received).toStrictEqual([
        sent(1, 1),
        sent(2, 2),
        sent(3, 3),
      ]);
    } finally {
      phone.socket.close();
    }
  });

  it("sends a connection opened without `since` only the events committed after its opening", async () => {
    const stub = household("events-publish-after-opening");
    await inHousehold(stub, command(happened(1)));
    const phone = await connect(stub);
    try {
      await inHousehold(stub, command(happened(2)));
      await publish(stub);
      await settled();

      expect(phone.received).toStrictEqual([sent(2, 2)]);
    } finally {
      phone.socket.close();
    }
  });
});

const resync = (sequence: number) => ({ type: "resync", sequence });

describe("DomainEvents in the Workers runtime — `?since=` replays what the phone missed (technique-v2 §6.3)", () => {
  // The line's verification: replay after a reconnection.
  it("sends a phone that reconnects with its last number the events it missed, in order, then the new ones", async () => {
    const stub = household("events-reconnection");
    const before = await connect(stub);
    await inHousehold(stub, command(happened(1)));
    await publish(stub);
    await settled();
    expect(before.received).toStrictEqual([sent(1, 1)]);
    before.socket.close();
    await settled();

    // While the phone is away: two events, one of them internal.
    await inHousehold(stub, command(happened(2), happened(3, "internal")));
    await inHousehold(stub, command(happened(4)));
    await publish(stub);
    const after = await connect(stub, "?since=1");
    try {
      await inHousehold(stub, command(happened(5)));
      await publish(stub);
      await settled();

      expect(after.received).toStrictEqual([
        sent(2, 2),
        sent(4, 4),
        sent(5, 5),
      ]);
    } finally {
      after.socket.close();
    }
  });

  it("sends nothing to a phone already up to date, then the events committed after", async () => {
    const stub = household("events-up-to-date");
    await inHousehold(stub, command(happened(1), happened(2)));
    const phone = await connect(stub, "?since=2");
    try {
      await inHousehold(stub, command(happened(3)));
      await publish(stub);
      await settled();

      expect(phone.received).toStrictEqual([sent(3, 3)]);
    } finally {
      phone.socket.close();
    }
  });

  it("asks a phone whose number this household never gave (a database restored to an earlier point) to resync on the latest one", async () => {
    const stub = household("events-since-ahead");
    await inHousehold(stub, command(happened(1), happened(2)));
    const phone = await connect(stub, "?since=7");
    try {
      await inHousehold(stub, command(happened(3)));
      await publish(stub);
      await settled();

      expect(phone.received).toStrictEqual([resync(2), sent(3, 3)]);
    } finally {
      phone.socket.close();
    }
  });

  it("refuses a `since` that is not a sequence number with the validation problem, and opens nothing", async () => {
    const stub = household("events-since-refused");
    const response = await stub.fetch(`${origin}/api/v1/live?since=-1`, {
      headers: { Upgrade: "websocket", Origin: origin },
    });

    expect(response.status).toBe(400);
    expect(response.headers.get("Content-Type")).toBe(
      "application/problem+json",
    );
    expect(await response.json()).toStrictEqual({
      type: "/problems/validation",
      title: "Bad Request",
      status: 400,
    });
    expect(response.webSocket).toBeNull();
    expect(
      await runInDurableObject(
        stub,
        (_instance, state) => state.getWebSockets().length,
      ),
    ).toBe(0);
  });
});

// Schedules a deadline of `kind` due at T0, for the object's alarm to run.
const due = (stub: DurableObjectStub, kind: string, subject: string) =>
  runInDurableObject(stub, (_instance, state) =>
    Effect.runPromise(
      Effect.gen(function* () {
        const scheduled = yield* Deadlines;
        yield* scheduled.schedule({
          kind,
          subject,
          dueAt: DateTime.makeUnsafe(T0),
        });
      }).pipe(Effect.provide(deadlines.layer(state.storage))),
    ),
  );

// Fires the object's alarm through `Household.alarm()`, which then settles the invocation as in
// production. No module runs a command from a deadline yet: the test provides the executors, which
// append through the object's own `DomainEvents`, and the clock (pattern of deadlines.workers.test.ts).
const runAlarm = async (
  stub: DurableObjectStub,
  executors: DeadlineExecutors<DomainEvents>,
) => {
  const runDueDeadlines = deadlines.runDueDeadlines;
  const run = vi
    .spyOn(deadlines, "runDueDeadlines")
    .mockImplementation((storage) =>
      Effect.scoped(
        Effect.gen(function* () {
          const clock = yield* TestClock.make();
          yield* clock.setTime(T0);
          // The same `append` as the object's (it has no reaction), on the object's SQL client.
          const appending = yield* Layer.build(events.layer({}));
          yield* runDueDeadlines(storage, executors).pipe(
            Effect.provideContext(appending),
            Effect.provideService(Clock.Clock, clock),
          );
        }),
      ),
    );
  try {
    return await runDurableObjectAlarm(stub);
  } finally {
    run.mockRestore();
  }
};

// Polls from the test's side: a promise the object resolves would resume the test inside the
// object, where opening another request is refused ("I/O on behalf of a different Durable Object").
const until = async (condition: () => boolean): Promise<void> => {
  if (condition()) return;
  await new Promise((resolve) => setTimeout(resolve, 5));
  return until(condition);
};

// Waits in real time, inside a transaction: what the phone receives meanwhile was sent during it.
const pause = (ms: number) =>
  Effect.promise(() => new Promise((resolve) => setTimeout(resolve, ms)));

describe("Household in the Workers runtime — an invocation's events are sent once its work committed (technique-v2 §5.4)", () => {
  it("sends a command's event after its transaction committed, never while it is open", async () => {
    const stub = household("events-after-commit");
    const phone = await connect(stub);
    let receivedDuringTransaction: number | undefined;
    try {
      await due(stub, "test.command", "a");

      await runAlarm(stub, {
        "test.command": () =>
          Effect.gen(function* () {
            const domainEvents = yield* DomainEvents;
            yield* domainEvents.append(happened(1));
            yield* pause(200);
            receivedDuringTransaction = phone.received.length;
          }),
      });
      await settled();

      expect(receivedDuringTransaction).toBe(0);
      expect(phone.received).toStrictEqual([sent(1, 1)]);
    } finally {
      phone.socket.close();
    }
  });

  it("sends nothing of a command whose transaction fails, and keeps none of its events", async () => {
    const stub = household("events-rolled-back");
    const phone = await connect(stub);
    try {
      await due(stub, "test.failing-command", "a");

      await runAlarm(stub, {
        "test.failing-command": () =>
          Effect.gen(function* () {
            const domainEvents = yield* DomainEvents;
            yield* domainEvents.append(happened(1));
            return yield* Effect.die(new Error("the command fails"));
          }),
      });
      await settled();
      await settled();

      expect(phone.received).toStrictEqual([]);
      expect(await storedEvents(stub)).toStrictEqual([]);
    } finally {
      phone.socket.close();
    }
  });

  it("sends the events of two successive commands in the order of their sequence numbers", async () => {
    const stub = household("events-two-commands");
    const phone = await connect(stub);
    try {
      await due(stub, "test.command", "first");
      await due(stub, "test.command", "second");

      await runAlarm(stub, {
        "test.command": (subject) =>
          Effect.gen(function* () {
            const domainEvents = yield* DomainEvents;
            yield* domainEvents.append(happened(subject === "first" ? 1 : 2));
          }),
      });
      await settled();

      expect(phone.received).toStrictEqual([sent(1, 1), sent(2, 2)]);
    } finally {
      phone.socket.close();
    }
  });
});

describe("Household in the Workers runtime — an event committed while a phone reconnects reaches it once, in order", () => {
  it("sends a phone reconnecting during a command's transaction the missed events and the command's, once each, in order", async () => {
    const stub = household("events-reconnect-race");
    await inHousehold(stub, command(happened(1), happened(2)));
    await due(stub, "test.command", "a");
    const command3 = { inTransaction: false };

    const alarm = runAlarm(stub, {
      "test.command": () =>
        Effect.gen(function* () {
          const domainEvents = yield* DomainEvents;
          yield* domainEvents.append(happened(3));
          command3.inTransaction = true;
          yield* pause(300);
        }),
    });
    // The phone reconnects while the command's transaction is open.
    await until(() => command3.inTransaction);
    const opening = connect(stub, "?since=1");
    await alarm;
    const phone = await opening;
    try {
      await publish(stub);
      await settled();

      expect(phone.received).toStrictEqual([sent(2, 2), sent(3, 3)]);
    } finally {
      phone.socket.close();
    }
  });
});

const T1 = T0 + 60_000;

// Runs `reactions` in place of the household's (none yet) when the object settles an invocation,
// with the object's clock at T1: the real `settle`, called with the test's arguments.
const settlingWith = (reactions: EventReactions) => {
  const settle = events.settle;
  return vi.spyOn(events, "settle").mockImplementation((ctx) =>
    Effect.scoped(
      Effect.gen(function* () {
        const clock = yield* TestClock.make();
        yield* clock.setTime(T1);
        yield* settle(ctx, reactions).pipe(
          Effect.provideService(Clock.Clock, clock),
        );
      }),
    ),
  );
};

// Any invocation of the object: an API request. Its body is read, so that an eviction never waits
// for it.
const invoke = async (stub: DurableObjectStub) => {
  const response = await stub.fetch(`${origin}/api/v1/health`);
  await response.text();
  return response.status;
};

// A reaction that records each event it runs for.
const recorder = (
  kinds: readonly ("test.happened" | "test.other")[] = ["test.happened"],
) => {
  const ran: RecordedDomainEvent[] = [];
  const reaction: EventReaction = {
    kinds,
    react: (event) => Effect.sync(() => void ran.push(event)),
  };
  return { ran, reaction };
};

describe("Household in the Workers runtime — internal reactions run once per event (technique-v2 §5.4)", () => {
  // The line's verification: a reaction replayed after `evictDurableObject`, never twice.
  it("runs after an eviction a reaction whose event committed but which never ran, once, and never again", async () => {
    const stub = household("reactions-after-eviction");
    const souvenir = recorder();
    const reactions: EventReactions = { souvenir: souvenir.reaction };
    // The event committed, and the invocation ended before its reactions ran (as if the object had
    // been reset then): its marker is pending.
    await inHousehold(stub, command(happened(1)), reactions);
    await evictDurableObject(stub);
    const settling = settlingWith(reactions);
    try {
      expect(await invoke(stub)).toBe(200);

      expect(souvenir.ran).toStrictEqual([
        {
          sequence: 1,
          kind: "test.happened",
          audience: "household",
          payload: { n: 1 },
          occurredAt: T0,
        },
      ]);
      expect(await reactionRows(stub)).toStrictEqual([
        { reaction: "souvenir", sequence: 1, handled_at: T1 },
      ]);

      expect(await invoke(stub)).toBe(200);
      await evictDurableObject(stub);
      expect(await invoke(stub)).toBe(200);
      expect(souvenir.ran).toHaveLength(1);
    } finally {
      settling.mockRestore();
    }
  });

  it("runs each pending reaction in the order of the events, then leaves none pending", async () => {
    const stub = household("reactions-order");
    const souvenir = recorder();
    const push = recorder(["test.happened", "test.other"]);
    const reactions: EventReactions = {
      souvenir: souvenir.reaction,
      push: push.reaction,
    };
    await inHousehold(
      stub,
      command(happened(1), happened(2, "internal")),
      reactions,
    );
    const settling = settlingWith(reactions);
    try {
      await invoke(stub);

      expect(souvenir.ran.map((event) => event.sequence)).toStrictEqual([1, 2]);
      expect(push.ran.map((event) => event.sequence)).toStrictEqual([1, 2]);
      expect(await reactionRows(stub)).toStrictEqual([
        { reaction: "push", sequence: 1, handled_at: T1 },
        { reaction: "souvenir", sequence: 1, handled_at: T1 },
        { reaction: "push", sequence: 2, handled_at: T1 },
        { reaction: "souvenir", sequence: 2, handled_at: T1 },
      ]);
    } finally {
      settling.mockRestore();
    }
  });

  it("runs a command's reactions in the invocation that committed it, and sends what they append", async () => {
    const stub = household("reactions-same-invocation");
    const phone = await connect(stub);
    const reactions: EventReactions = {
      echo: {
        kinds: ["test.happened"],
        react: (event) =>
          Effect.gen(function* () {
            const domainEvents = yield* DomainEvents;
            yield* domainEvents.append({
              kind: "test.other",
              audience: "household",
              payload: { echo: event.sequence },
            });
          }),
      },
    };
    const settling = settlingWith(reactions);
    try {
      await due(stub, "test.command", "a");
      // The object's own DomainEvents has no reaction: the command's marker is written by hand,
      // in its transaction, as `append` writes it for a subscribed reaction.
      await runAlarm(stub, {
        "test.command": () =>
          Effect.gen(function* () {
            const sql = yield* SqlClient.SqlClient;
            const domainEvents = yield* DomainEvents;
            const sequence = yield* domainEvents.append(happened(1));
            yield* sql`INSERT INTO event_reactions (reaction, sequence) VALUES ('echo', ${sequence})`;
          }),
      });
      await settled();

      expect(phone.received).toStrictEqual([
        sent(1, 1),
        {
          type: "event",
          sequence: 2,
          kind: "test.other",
          payload: { echo: 1 },
        },
      ]);
      expect(await reactionRows(stub)).toStrictEqual([
        { reaction: "echo", sequence: 1, handled_at: T1 },
      ]);
    } finally {
      settling.mockRestore();
      phone.socket.close();
    }
  });
});

// Runs the household's pending reactions inside the object, as `settle` does, at T1.
const runReactions = (
  stub: DurableObjectStub,
  reactions: EventReactions,
  runs = 1,
) =>
  inHousehold(
    stub,
    Effect.all(
      Array.from({ length: runs }, () => events.runPendingReactions(reactions)),
      { concurrency: "unbounded" },
      // Concurrent runs yield to each other after every operation, as two invocations of the
      // object may interleave at any await point.
    ).pipe(Effect.provideService(Scheduler.MaxOpsBeforeYield, 20)),
    reactions,
    T1,
  );

// A reaction's own SQL effect: one row of a table the test creates.
const effectsTable = (stub: DurableObjectStub) =>
  runInDurableObject(stub, (_instance, state) => {
    state.storage.sql.exec(
      "CREATE TABLE IF NOT EXISTS test_effects (reaction TEXT, sequence INTEGER)",
    );
  });
const writeEffect = (reaction: string, sequence: number) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    yield* sql`INSERT INTO test_effects (reaction, sequence) VALUES (${reaction}, ${sequence})`;
  });
const effects = (stub: DurableObjectStub) =>
  table(
    stub,
    "SELECT reaction, sequence FROM test_effects ORDER BY sequence, reaction",
  );

describe("Household in the Workers runtime — a reaction's effect and its marker commit together", () => {
  it("rolls back a failing reaction's writes, marks it without retrying, and still runs the other reactions and events", async () => {
    const stub = household("reactions-failure");
    await effectsTable(stub);
    let attempts = 0;
    const reactions: EventReactions = {
      failing: {
        kinds: ["test.happened"],
        react: (event) =>
          writeEffect("failing", event.sequence).pipe(
            Effect.andThen(
              event.sequence === 1
                ? Effect.sync(() => {
                    attempts += 1;
                  }).pipe(
                    Effect.andThen(Effect.die(new Error("the reaction fails"))),
                  )
                : Effect.void,
            ),
          ),
      },
      other: {
        kinds: ["test.happened"],
        react: (event) => writeEffect("other", event.sequence),
      },
    };
    await inHousehold(stub, command(happened(1), happened(2)), reactions);

    // Two invocations at the same time, then a later one.
    await runReactions(stub, reactions, 2);
    await runReactions(stub, reactions);

    expect(attempts).toBe(1);
    expect(await effects(stub)).toStrictEqual([
      { reaction: "other", sequence: 1 },
      { reaction: "failing", sequence: 2 },
      { reaction: "other", sequence: 2 },
    ]);
    expect(await reactionRows(stub)).toStrictEqual([
      { reaction: "failing", sequence: 1, handled_at: T1 },
      { reaction: "other", sequence: 1, handled_at: T1 },
      { reaction: "failing", sequence: 2, handled_at: T1 },
      { reaction: "other", sequence: 2, handled_at: T1 },
    ]);
  });

  it("rolls back a reaction's effect when its marker cannot be written", async () => {
    const stub = household("reactions-marker-with-effect");
    await effectsTable(stub);
    // The marker is refused while the effect's row exists in the same database state: written in
    // one transaction, the effect goes with it; written after the effect committed, it would stay.
    await runInDurableObject(stub, (_instance, state) => {
      state.storage.sql.exec(`
        CREATE TRIGGER test_refuse_marker BEFORE UPDATE OF handled_at ON event_reactions
        WHEN EXISTS (SELECT 1 FROM test_effects)
        BEGIN SELECT RAISE(ABORT, 'marker refused'); END`);
    });
    const reactions: EventReactions = {
      souvenir: {
        kinds: ["test.happened"],
        react: (event) => writeEffect("souvenir", event.sequence),
      },
    };
    await inHousehold(stub, command(happened(1)), reactions);

    await runReactions(stub, reactions);

    expect(await effects(stub)).toStrictEqual([]);
    expect(await reactionRows(stub)).toStrictEqual([
      { reaction: "souvenir", sequence: 1, handled_at: T1 },
    ]);
  });

  it("marks a reaction handled only once it has run: while it runs, its event is still pending", async () => {
    const stub = household("reactions-marker-after");
    const seen: unknown[] = [];
    const reactions: EventReactions = {
      souvenir: {
        kinds: ["test.happened"],
        react: (event) =>
          Effect.gen(function* () {
            const sql = yield* SqlClient.SqlClient;
            seen.push(
              ...(yield* sql`SELECT handled_at FROM event_reactions WHERE sequence = ${event.sequence}`),
            );
          }),
      },
    };
    await inHousehold(stub, command(happened(1)), reactions);

    await runReactions(stub, reactions);

    expect(seen).toStrictEqual([{ handled_at: null }]);
  });

  it("runs a reaction once when two invocations look for pending reactions at the same time", async () => {
    const stub = household("reactions-concurrent");
    const souvenir = recorder();
    const reactions: EventReactions = { souvenir: souvenir.reaction };
    await inHousehold(stub, command(happened(1)), reactions);

    await runReactions(stub, reactions, 2);

    expect(souvenir.ran).toHaveLength(1);
  });
});

// An export is a household's whole database (J1.15); `sqlite_sequence`, SQLite's own, is not in it.
const exportOf = (stub: ReturnType<typeof household>) => stub.exportHousehold();
const restoreInto = (stub: DurableObjectStub, exported: string) =>
  runInDurableObject(stub, (_instance, state) =>
    restoreHousehold(state.storage, exported),
  );

describe("DomainEvents in the Workers runtime — export, import and restore keep the events (technique-v2 §12.4)", () => {
  it("keeps the sequence numbers and the markers through export → import, and runs again only the reactions never handled", async () => {
    const source = household("events-export-source");
    const target = household("events-export-target");
    const souvenir = recorder();
    const reactions: EventReactions = { souvenir: souvenir.reaction };
    await inHousehold(
      source,
      command(happened(1), happened(2, "internal")),
      reactions,
    );
    await runReactions(source, reactions);
    await inHousehold(source, command(happened(3)), reactions);
    expect(souvenir.ran).toHaveLength(2);
    const sourceEvents = await storedEvents(source);
    const sourceMarkers = await reactionRows(source);

    expect(await restoreInto(target, await exportOf(source))).toStrictEqual({
      restored: { tables: 4, rows: 6 },
    });

    expect(await storedEvents(target)).toStrictEqual(sourceEvents);
    expect(await reactionRows(target)).toStrictEqual(sourceMarkers);
    await runReactions(target, reactions);
    expect(souvenir.ran.map((event) => event.sequence)).toStrictEqual([
      1, 2, 3,
    ]);
    expect(await inHousehold(target, command(happened(4)))).toStrictEqual([4]);
  });

  it("never numbers an event below one already given, after importing an older export into the same household", async () => {
    const stub = household("events-older-import");
    await inHousehold(stub, command(happened(1), happened(2)));
    const older = await exportOf(stub);
    // Numbers 3 and 4 reach a phone, then the household is restored to the older export.
    const phone = await connect(stub);
    await inHousehold(stub, command(happened(3), happened(4)));
    await publish(stub);
    await settled();
    expect(phone.received).toStrictEqual([sent(3, 3), sent(4, 4)]);
    phone.socket.close();

    await restoreInto(stub, older);

    expect(await inHousehold(stub, command(happened(5)))).toStrictEqual([5]);
    // The phone that last received 4 cannot be brought up to date by a replay: 3 and 4 are gone.
    const back = await connect(stub, "?since=4");
    try {
      await settled();
      expect(back.received).toStrictEqual([resync(5)]);
    } finally {
      back.socket.close();
    }
  });
});
