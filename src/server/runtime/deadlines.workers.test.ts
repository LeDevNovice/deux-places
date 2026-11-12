/// <reference types="@cloudflare/vitest-plugin/types" />
import {
  evictDurableObject,
  runDurableObjectAlarm,
  runInDurableObject,
} from "cloudflare:test";
import { env } from "cloudflare:workers";
import { Clock, DateTime, Effect, Schema } from "effect";
import { SqlClient } from "effect/sql";
import { TestClock } from "effect/testing";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as deadlines from "./deadlines";
import { Deadlines, type DeadlineExecutors } from "./deadlines";

// Plan J1.12; technique-v2 §5.5, §7.1 (instants in UTC milliseconds), §7.3 (one alarm per object,
// always on the earliest row of `deadlines`), §7.4 (each setAlarm() is one row written).

// Local workerd has no jurisdictions: the tests run with DURABLE_OBJECT_JURISDICTION=none.
const household = (name: string) =>
  env.Household.get(env.Household.idFromName(name));

// The household's time, as its Effect Clock reads it. Later than the real clock, so that workerd
// never fires these alarms by itself: only runDurableObjectAlarm does.
const T0 = DateTime.toEpochMillis(DateTime.makeUnsafe("2031-03-01T20:00:00Z"));
const minutes = (count: number) => count * 60_000;
let now = T0;
afterEach(() => {
  now = T0;
});

const schedule = (
  stub: DurableObjectStub,
  kind: string,
  subject: string,
  dueAt: number,
) =>
  runInDurableObject(stub, (_instance, state) =>
    Effect.runPromise(
      Effect.gen(function* () {
        const scheduled = yield* Deadlines;
        yield* scheduled.schedule({
          kind,
          subject,
          dueAt: DateTime.makeUnsafe(dueAt),
        });
      }).pipe(Effect.provide(deadlines.layer(state.storage))),
    ),
  );

const rows = (stub: DurableObjectStub) =>
  runInDurableObject(stub, (_instance, state) =>
    state.storage.sql
      .exec(
        "SELECT kind, subject, due_at FROM deadlines ORDER BY due_at, kind, subject",
      )
      .toArray(),
  );

const alarm = (stub: DurableObjectStub) =>
  runInDurableObject(stub, (_instance, state) => state.storage.getAlarm());

// Fires the object's alarm through `Household.alarm()` (runDurableObjectAlarm runs it at once,
// whatever its instant). The household has no executor of its own yet: the test provides them,
// and the clock, by calling the real `runDueDeadlines` with its own arguments under a TestClock
// set to `now`.
const runAlarm = async (
  stub: DurableObjectStub,
  executors: DeadlineExecutors,
) => {
  const runDueDeadlines = deadlines.runDueDeadlines;
  const run = vi
    .spyOn(deadlines, "runDueDeadlines")
    .mockImplementation((storage) =>
      Effect.scoped(
        Effect.gen(function* () {
          const clock = yield* TestClock.make();
          yield* clock.setTime(now);
          yield* runDueDeadlines(storage, executors).pipe(
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

// An executor that only records the subjects it ran, in order.
const recorder = () => {
  const ran: string[] = [];
  const run = (subject: string) => Effect.sync(() => void ran.push(subject));
  return { ran, run };
};

describe("Deadlines in the Workers runtime — schedule writes the deadline and arms the alarm on the earliest one", () => {
  it("writes the deadline with its instant in UTC milliseconds and arms the alarm on it", async () => {
    const stub = household("deadlines-schedule-first");

    await schedule(stub, "reminder", "a", T0 + minutes(10));

    expect(await rows(stub)).toStrictEqual([
      { kind: "reminder", subject: "a", due_at: T0 + minutes(10) },
    ]);
    expect(await alarm(stub)).toBe(T0 + minutes(10));
  });

  it("does not move the alarm for a later deadline, and moves it for an earlier one", async () => {
    const stub = household("deadlines-schedule-order");
    await schedule(stub, "reminder", "a", T0 + minutes(10));

    await schedule(stub, "reminder", "b", T0 + minutes(20));
    expect(await alarm(stub)).toBe(T0 + minutes(10));

    await schedule(stub, "reminder", "c", T0 + minutes(5));
    expect(await alarm(stub)).toBe(T0 + minutes(5));
  });

  it("keeps one row for a deadline scheduled again, at its new instant, and arms on the earliest", async () => {
    const stub = household("deadlines-schedule-again");
    await schedule(stub, "reminder", "a", T0 + minutes(10));
    await schedule(stub, "checkpoint", "a", T0 + minutes(20));

    await schedule(stub, "reminder", "a", T0 + minutes(30));

    expect(await rows(stub)).toStrictEqual([
      { kind: "checkpoint", subject: "a", due_at: T0 + minutes(20) },
      { kind: "reminder", subject: "a", due_at: T0 + minutes(30) },
    ]);
    expect(await alarm(stub)).toBe(T0 + minutes(20));
  });
});

describe("Deadlines in the Workers runtime — the alarm runs the due deadlines once and re-arms on the next one", () => {
  it("runs the deadlines due at its instant, in order, once each, and leaves the later ones", async () => {
    const stub = household("deadlines-alarm-due");
    const reminder = recorder();
    await schedule(stub, "reminder", "next", T0 + 1);
    await schedule(stub, "reminder", "due-now", T0);
    await schedule(stub, "reminder", "late", T0 - minutes(1));

    expect(await runAlarm(stub, { reminder: reminder.run })).toBe(true);

    expect(reminder.ran).toStrictEqual(["late", "due-now"]);
    expect(await rows(stub)).toStrictEqual([
      { kind: "reminder", subject: "next", due_at: T0 + 1 },
    ]);
    expect(await alarm(stub)).toBe(T0 + 1);

    expect(await runAlarm(stub, { reminder: reminder.run })).toBe(true);
    expect(reminder.ran).toStrictEqual(["late", "due-now"]);
    expect(await alarm(stub)).toBe(T0 + 1);
  });

  it("leaves no alarm once no deadline is left", async () => {
    const stub = household("deadlines-alarm-last");
    const reminder = recorder();
    await schedule(stub, "reminder", "a", T0);

    expect(await runAlarm(stub, { reminder: reminder.run })).toBe(true);

    expect(reminder.ran).toStrictEqual(["a"]);
    expect(await rows(stub)).toStrictEqual([]);
    expect(await alarm(stub)).toBeNull();
    expect(await runAlarm(stub, { reminder: reminder.run })).toBe(false);
    expect(reminder.ran).toStrictEqual(["a"]);
  });
});

// Schedules, from inside a run, a deadline that is already due.
const scheduleDue = (subject: string) =>
  Effect.gen(function* () {
    const scheduled = yield* Deadlines;
    yield* scheduled.schedule({
      kind: "reminder",
      subject: `${subject}-follow-up`,
      dueAt: DateTime.makeUnsafe(now),
    });
  });

// The line's verification: an alarm re-armed on "now" would fire again at once, without end.
describe("Deadlines in the Workers runtime — the alarm never re-arms on the current instant", () => {
  it("runs in the same invocation a deadline due when it re-arms, and arms on the next later one", async () => {
    const stub = household("deadlines-anti-loop-later");
    const reminder = recorder();
    const executors = { chain: scheduleDue, reminder: reminder.run };
    await schedule(stub, "chain", "a", T0 - minutes(1));
    await schedule(stub, "reminder", "later", T0 + minutes(60));

    expect(await runAlarm(stub, executors)).toBe(true);

    expect(reminder.ran).toStrictEqual(["a-follow-up"]);
    expect(await rows(stub)).toStrictEqual([
      { kind: "reminder", subject: "later", due_at: T0 + minutes(60) },
    ]);
    expect(await alarm(stub)).toBe(T0 + minutes(60));

    expect(await runAlarm(stub, executors)).toBe(true);
    expect(reminder.ran).toStrictEqual(["a-follow-up"]);
    expect(await alarm(stub)).toBe(T0 + minutes(60));
  });

  it("runs in the same invocation a deadline reached while the previous one ran", async () => {
    const stub = household("deadlines-anti-loop-reached");
    const reminder = recorder();
    // A run that takes a minute of the household's time.
    const executors: DeadlineExecutors = {
      slow: () => TestClock.adjust("1 minute"),
      reminder: reminder.run,
    };
    await schedule(stub, "slow", "a", T0);
    await schedule(stub, "reminder", "b", T0 + 30_000);
    await schedule(stub, "reminder", "c", T0 + minutes(10));

    expect(await runAlarm(stub, executors)).toBe(true);

    expect(reminder.ran).toStrictEqual(["b"]);
    expect(await rows(stub)).toStrictEqual([
      { kind: "reminder", subject: "c", due_at: T0 + minutes(10) },
    ]);
    expect(await alarm(stub)).toBe(T0 + minutes(10));
  });

  it("leaves no alarm when the deadline due when it re-arms was the last one", async () => {
    const stub = household("deadlines-anti-loop-last");
    const reminder = recorder();
    const executors = { chain: scheduleDue, reminder: reminder.run };
    await schedule(stub, "chain", "a", T0);

    expect(await runAlarm(stub, executors)).toBe(true);

    expect(reminder.ran).toStrictEqual(["a-follow-up"]);
    expect(await rows(stub)).toStrictEqual([]);
    expect(await alarm(stub)).toBeNull();
    expect(await runAlarm(stub, executors)).toBe(false);
    expect(reminder.ran).toStrictEqual(["a-follow-up"]);
  });
});

describe("Deadlines in the Workers runtime — a deadline survives an eviction", () => {
  it("keeps the deadline and its alarm when the object is evicted, runs it after the wake, and never again", async () => {
    const stub = household("deadlines-eviction");
    const reminder = recorder();
    await schedule(stub, "reminder", "a", T0 + minutes(10));
    const before = await runInDurableObject(stub, (instance) => instance);

    await evictDurableObject(stub);

    expect(await alarm(stub)).toBe(T0 + minutes(10));
    expect(await runInDurableObject(stub, (instance) => instance)).not.toBe(
      before,
    );
    now = T0 + minutes(10);
    expect(await runAlarm(stub, { reminder: reminder.run })).toBe(true);
    expect(reminder.ran).toStrictEqual(["a"]);

    await evictDurableObject(stub);

    expect(await runAlarm(stub, { reminder: reminder.run })).toBe(false);
    expect(reminder.ran).toStrictEqual(["a"]);
    expect(await rows(stub)).toStrictEqual([]);
  });
});

// One line of Effect's JSON logger: the fields the tests read.
const LogLine = Schema.Struct({
  level: Schema.String,
  message: Schema.Unknown,
  cause: Schema.optional(Schema.String),
  annotations: Schema.Record(Schema.String, Schema.Unknown),
});

// Runs the alarm and returns the JSON lines it logged.
const runAlarmLogged = async (
  stub: DurableObjectStub,
  executors: DeadlineExecutors,
) => {
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  try {
    const ran = await runAlarm(stub, executors);
    const lines = log.mock.calls.map(([line]) =>
      Schema.decodeUnknownSync(LogLine)(JSON.parse(String(line))),
    );
    return { ran, lines };
  } finally {
    log.mockRestore();
  }
};

// A table of the test's own, for what the executors write.
const createEffects = (stub: DurableObjectStub) =>
  runInDurableObject(stub, (_instance, state) => {
    state.storage.sql.exec("CREATE TABLE test_effects (subject TEXT NOT NULL)");
  });
const effects = (stub: DurableObjectStub) =>
  runInDurableObject(stub, (_instance, state) =>
    state.storage.sql
      .exec("SELECT subject FROM test_effects ORDER BY subject")
      .toArray(),
  );
const write = (subject: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    yield* sql`INSERT INTO test_effects (subject) VALUES (${subject})`;
  });

describe("Deadlines in the Workers runtime — a deadline whose run fails is dropped, without its writes", () => {
  it("drops a failed deadline without a second attempt, undoes its writes, logs it, and still runs the others", async () => {
    const stub = household("deadlines-failure");
    await createEffects(stub);
    let attempts = 0;
    const executors: DeadlineExecutors = {
      broken: (subject) =>
        write(subject).pipe(
          Effect.andThen(Effect.sync(() => void attempts++)),
          Effect.andThen(Effect.die(new Error("push service unavailable"))),
        ),
      reminder: write,
    };
    await schedule(stub, "broken", "x", T0 - minutes(2));
    await schedule(stub, "reminder", "y", T0 - minutes(1));
    await schedule(stub, "reminder", "z", T0 + minutes(60));

    const { ran, lines } = await runAlarmLogged(stub, executors);

    expect(ran).toBe(true);
    expect(attempts).toBe(1);
    expect(await effects(stub)).toStrictEqual([{ subject: "y" }]);
    expect(await rows(stub)).toStrictEqual([
      { kind: "reminder", subject: "z", due_at: T0 + minutes(60) },
    ]);
    expect(await alarm(stub)).toBe(T0 + minutes(60));
    expect(lines).toMatchObject([
      {
        level: "ERROR",
        cause: expect.stringContaining("push service unavailable"),
        annotations: { "deadline.kind": "broken", "deadline.subject": "x" },
      },
    ]);

    expect(await runAlarm(stub, executors)).toBe(true);
    expect(attempts).toBe(1);
  });

  it("drops a due deadline whose kind has no executor, logs it, and still runs the others", async () => {
    const stub = household("deadlines-unknown-kind");
    const reminder = recorder();
    await schedule(stub, "retired", "x", T0 - minutes(2));
    await schedule(stub, "reminder", "y", T0 - minutes(1));

    const { ran, lines } = await runAlarmLogged(stub, {
      reminder: reminder.run,
    });

    expect(ran).toBe(true);
    expect(reminder.ran).toStrictEqual(["y"]);
    expect(await rows(stub)).toStrictEqual([]);
    expect(await alarm(stub)).toBeNull();
    expect(lines).toMatchObject([
      {
        level: "ERROR",
        annotations: { "deadline.kind": "retired", "deadline.subject": "x" },
      },
    ]);
  });
});

describe("Deadlines in the Workers runtime — a run may schedule its own next occurrence", () => {
  it("keeps the next occurrence that a run schedules for its own kind and subject", async () => {
    const stub = household("deadlines-next-occurrence");
    const executors: DeadlineExecutors = {
      nightly: (subject) =>
        Effect.gen(function* () {
          const scheduled = yield* Deadlines;
          yield* scheduled.schedule({
            kind: "nightly",
            subject,
            dueAt: DateTime.makeUnsafe(now + minutes(24 * 60)),
          });
        }),
    };
    const setAlarm = await runInDurableObject(stub, (_instance, state) =>
      vi.spyOn(state.storage, "setAlarm"),
    );
    try {
      await schedule(stub, "nightly", "availability", T0);

      expect(await runAlarm(stub, executors)).toBe(true);

      // The run's own schedule already armed on the next occurrence: the end of the run does not
      // arm again (§7.4).
      expect(setAlarm.mock.calls).toStrictEqual([
        [T0],
        [T0 + minutes(24 * 60)],
      ]);
    } finally {
      setAlarm.mockRestore();
    }
    expect(await rows(stub)).toStrictEqual([
      {
        kind: "nightly",
        subject: "availability",
        due_at: T0 + minutes(24 * 60),
      },
    ]);
    expect(await alarm(stub)).toBe(T0 + minutes(24 * 60));
  });
});

// §7.4: each setAlarm() is billed as one row written. It is called only when the alarm must move.
describe("Deadlines in the Workers runtime — setAlarm is called only when the earliest deadline changes", () => {
  it("arms once per new earliest deadline, never for a later one or the same instant, and once per run that leaves one", async () => {
    const stub = household("deadlines-set-alarm-count");
    const reminder = recorder();
    const [setAlarm, deleteAlarm] = await runInDurableObject(
      stub,
      (_instance, state) => [
        vi.spyOn(state.storage, "setAlarm"),
        vi.spyOn(state.storage, "deleteAlarm"),
      ],
    );
    try {
      await schedule(stub, "reminder", "a", T0 + minutes(10));
      await schedule(stub, "reminder", "b", T0 + minutes(20));
      await schedule(stub, "reminder", "a", T0 + minutes(10));
      await schedule(stub, "reminder", "c", T0 + minutes(5));
      expect(setAlarm.mock.calls).toStrictEqual([
        [T0 + minutes(10)],
        [T0 + minutes(5)],
      ]);

      now = T0 + minutes(5);
      await runAlarm(stub, { reminder: reminder.run });
      now = T0 + minutes(20);
      await runAlarm(stub, { reminder: reminder.run });

      expect(reminder.ran).toStrictEqual(["c", "a", "b"]);
      expect(setAlarm.mock.calls).toStrictEqual([
        [T0 + minutes(10)],
        [T0 + minutes(5)],
        [T0 + minutes(10)],
      ]);
      // runDurableObjectAlarm deletes the alarm itself before calling alarm() (plugin source,
      // `runAlarm`): one call per run. The household's alarm, left with no deadline and no alarm
      // set, deletes nothing more.
      expect(deleteAlarm).toHaveBeenCalledTimes(2);
    } finally {
      setAlarm.mockRestore();
      deleteAlarm.mockRestore();
    }
  });
});

// §7.2: an applied migration is never edited; the table arrives with migration 0002.
describe("Deadlines in the Workers runtime — migration 0002 creates the deadlines table", () => {
  it("creates the table at the next start of a household that had only applied migration 0001", async () => {
    const stub = household("deadlines-migration-0002");
    const health = await stub.fetch("https://deux-places.test/api/v1/health");
    await health.text();
    // The household as a deploy before this line left it: migration 0001 only.
    await runInDurableObject(stub, (_instance, state) => {
      state.storage.sql.exec("DROP TABLE deadlines");
      state.storage.sql.exec(
        "DELETE FROM effect_sql_migrations WHERE migration_id = 2",
      );
    });

    await evictDurableObject(stub);
    await schedule(stub, "reminder", "a", T0 + minutes(10));

    expect(await rows(stub)).toStrictEqual([
      { kind: "reminder", subject: "a", due_at: T0 + minutes(10) },
    ]);
    expect(
      await runInDurableObject(stub, (_instance, state) =>
        state.storage.sql
          .exec(
            "SELECT migration_id, name FROM effect_sql_migrations ORDER BY migration_id",
          )
          .toArray(),
      ),
    ).toStrictEqual([
      { migration_id: 1, name: "baseline" },
      { migration_id: 2, name: "deadlines" },
    ]);
  });
});

// Without the test's executors and clock: the household's own alarm, its real Clock and its
// executor table (empty until a plan line adds a deadline).
describe("Deadlines in the Workers runtime — the household's own alarm reads the real time", () => {
  it("leaves a deadline that is not due yet, and its alarm", async () => {
    const stub = household("deadlines-own-alarm");
    await schedule(stub, "reminder", "a", T0 + minutes(10));

    expect(await runDurableObjectAlarm(stub)).toBe(true);

    expect(await rows(stub)).toStrictEqual([
      { kind: "reminder", subject: "a", due_at: T0 + minutes(10) },
    ]);
    expect(await alarm(stub)).toBe(T0 + minutes(10));
  });
});
