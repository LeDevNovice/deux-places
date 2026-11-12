import { SqliteClient } from "@effect/sql-sqlite-do";
import { Clock, Context, DateTime, Effect, Exit, Layer } from "effect";
import { SqlClient, type SqlError } from "effect/sql";

/**
 * A deadline of the household (technique-v2 §5.5, §7.3): at `dueAt`, the object runs what `kind`
 * names, for `subject`. One deadline per kind and subject: scheduling it again moves it.
 */
export interface Deadline {
  readonly kind: string;
  readonly subject: string;
  readonly dueAt: DateTime.Utc;
}

/** The household's deadlines, carried by the object's single alarm. */
export class Deadlines extends Context.Service<
  Deadlines,
  {
    readonly schedule: (
      deadline: Deadline,
    ) => Effect.Effect<void, SqlError.SqlError>;
  }
>()("Deadlines") {}

// Points the object's single alarm at the earliest deadline, or at nothing when none is left.
// Each setAlarm() is one row written (§7.4): it is only called when the alarm must move.
const armOnEarliest = (storage: DurableObjectStorage) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const [earliest] = yield* sql<{ readonly due_at: number }>`
      SELECT due_at FROM deadlines ORDER BY due_at LIMIT 1`;
    const armed = yield* Effect.promise(() => storage.getAlarm());
    if (earliest === undefined) {
      if (armed !== null) yield* Effect.promise(() => storage.deleteAlarm());
      return;
    }
    if (armed !== earliest.due_at)
      yield* Effect.promise(() => storage.setAlarm(earliest.due_at));
  });

const makeDeadlines = (storage: DurableObjectStorage) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    return {
      schedule: (deadline: Deadline) =>
        Effect.gen(function* () {
          const dueAt = DateTime.toEpochMillis(deadline.dueAt);
          yield* sql`
            INSERT INTO deadlines (kind, subject, due_at)
            VALUES (${deadline.kind}, ${deadline.subject}, ${dueAt})
            ON CONFLICT (kind, subject) DO UPDATE SET due_at = excluded.due_at`;
          yield* armOnEarliest(storage);
        }).pipe(Effect.provideService(SqlClient.SqlClient, sql)),
    };
  });

/** `Deadlines` on the object's SQLite storage, with the SQL client its deadlines run with. */
export const layer = (storage: DurableObjectStorage) =>
  Layer.effect(Deadlines, makeDeadlines(storage)).pipe(
    Layer.provideMerge(SqliteClient.layer({ storage })),
  );

/**
 * What each kind of deadline runs, for its subject. An executor handles its own errors (retrying
 * with a `Schedule` if it makes sense); only its SQL writes may fail through. Whatever escapes it,
 * failure or defect, drops the deadline (see `runDueDeadlines`).
 */
export type DeadlineExecutors = Readonly<
  Record<
    string,
    (
      subject: string,
    ) => Effect.Effect<void, SqlError.SqlError, SqlClient.SqlClient | Deadlines>
  >
>;

// A due deadline whose kind no executor runs (e.g. a kind retired by a deploy) is a defect: it is
// dropped like a run that fails.
const noExecutor = () =>
  Effect.die(new Error("no executor for this kind of deadline"));

/**
 * The alarm's work (§7.3): runs every deadline due at the time `Clock` reads, earliest first, then
 * arms the alarm on the earliest one left, which is always later than that time; never on "now",
 * where the alarm would fire again at once. A deadline that becomes due during the run (scheduled
 * by an executor, or reached while running) runs in the same invocation.
 */
export const runDueDeadlines = (
  storage: DurableObjectStorage,
  executors: DeadlineExecutors,
) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    while (true) {
      const now = yield* Clock.currentTimeMillis;
      const [next] = yield* sql<{
        readonly kind: string;
        readonly subject: string;
        readonly due_at: number;
      }>`SELECT kind, subject, due_at FROM deadlines ORDER BY due_at, kind, subject LIMIT 1`;
      if (next === undefined || next.due_at > now) break;
      const run = executors[next.kind] ?? noExecutor;
      const remove = sql`
        DELETE FROM deadlines
        WHERE kind = ${next.kind} AND subject = ${next.subject} AND due_at = ${next.due_at}`;
      // The run and the removal of its row are one transaction: a deadline never runs twice. The
      // row is removed by its instant too, so that the next occurrence a run schedules for itself
      // stays. A run that fails is rolled back, then its row is removed without a second attempt
      // and the failure logged: retrying is up to the executor (`Schedule`), and one failing
      // deadline never holds back the others nor re-arms the alarm on "now".
      const outcome = yield* Effect.exit(
        sql.withTransaction(run(next.subject).pipe(Effect.andThen(remove))),
      );
      if (Exit.isFailure(outcome)) {
        yield* remove;
        yield* Effect.logError("deadline failed", outcome.cause).pipe(
          Effect.annotateLogs({
            "deadline.kind": next.kind,
            "deadline.subject": next.subject,
          }),
        );
      }
    }
    yield* armOnEarliest(storage);
  });
