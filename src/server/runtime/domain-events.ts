import { Clock, Context, Effect, Exit, Layer, Semaphore } from "effect";
import { SqlClient, type SqlError } from "effect/sql";
import type {
  DomainEvent,
  DomainEventKind,
  RecordedDomainEvent,
} from "../../shared-kernel/domain-event";
import {
  eventMessage,
  maxReplay,
  parseJson,
  replayOf,
  type StoredEvent,
} from "./live";

/**
 * The household's event log (technique-v2 §5.4, §7.1). `append` writes an event in the caller's
 * transaction (`sql.withTransaction`), with the state it goes with, and resolves with its sequence
 * number. Nothing is sent or run then: that happens once the invocation's work is done (`settle`).
 */
export class DomainEvents extends Context.Service<
  DomainEvents,
  {
    readonly append: (
      event: DomainEvent,
    ) => Effect.Effect<number, SqlError.SqlError>;
  }
>()("DomainEvents") {}

/**
 * An internal reaction (technique-v2 §5.4): what it runs for each event of its kinds. Its SQL
 * writes commit with its `handled_at` marker, or not at all.
 */
export interface EventReaction {
  readonly kinds: readonly DomainEventKind[];
  readonly react: (
    event: RecordedDomainEvent,
  ) => Effect.Effect<
    void,
    SqlError.SqlError,
    SqlClient.SqlClient | DomainEvents
  >;
}

/** The household's reactions, by name; each plan line that adds one adds it here. */
export type EventReactions = Readonly<Record<string, EventReaction>>;

// The reactions that subscribe to `kind`, by name.
const subscribed = (reactions: EventReactions, kind: DomainEventKind) =>
  Object.entries(reactions)
    .filter(([, reaction]) => reaction.kinds.includes(kind))
    .map(([name]) => name);

const makeDomainEvents = (reactions: EventReactions) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    return {
      append: (event: DomainEvent) =>
        Effect.gen(function* () {
          const occurredAt = yield* Clock.currentTimeMillis;
          const [written] = yield* sql<{ readonly sequence: number }>`
            INSERT INTO domain_events (kind, audience, occurred_at, payload)
            VALUES (${event.kind}, ${event.audience}, ${occurredAt}, ${JSON.stringify(event.payload)})
            RETURNING sequence`;
          if (written === undefined)
            return yield* Effect.die(new Error("the event was not written"));
          const { sequence } = written;
          for (const reaction of subscribed(reactions, event.kind))
            yield* sql`
              INSERT INTO event_reactions (reaction, sequence) VALUES (${reaction}, ${sequence})`;
          return sequence;
        }),
    };
  });

/**
 * Serializes what the object sends on its live connections: a publication and an opening never
 * interleave, so each connection receives its events once, in increasing order.
 */
export class EventDelivery extends Context.Service<
  EventDelivery,
  Semaphore.Semaphore
>()("EventDelivery") {}

/**
 * Serializes the object's runs of pending reactions: a run that fails is rolled back and then
 * marked, and no other invocation may attempt it in between.
 */
export class ReactionRuns extends Context.Service<
  ReactionRuns,
  Semaphore.Semaphore
>()("ReactionRuns") {}

/**
 * `DomainEvents` on the household's SQL client, with the reactions that subscribe to its kinds,
 * and the object's `EventDelivery` and `ReactionRuns`. Built once per object (§10.2).
 */
export const layer = (reactions: EventReactions) =>
  Layer.mergeAll(
    Layer.effect(DomainEvents, makeDomainEvents(reactions)),
    Layer.effect(EventDelivery, Semaphore.make(1)),
    Layer.effect(ReactionRuns, Semaphore.make(1)),
  );

/**
 * What a live connection carries across hibernation (WebSocket attachment, at most 2,048 bytes):
 * the latest sequence number it was brought up to. Every event up to it was sent, or is internal.
 */
interface LiveAttachment {
  readonly sent: number;
}

// A connection opened before this attachment existed has none: the object sends it nothing.
const sentOf = (socket: WebSocket): number | undefined => {
  const attachment: unknown = socket.deserializeAttachment();
  return typeof attachment === "object" &&
    attachment !== null &&
    "sent" in attachment &&
    typeof attachment.sent === "number"
    ? attachment.sent
    : undefined;
};

const markSent = (socket: WebSocket, sent: number) => {
  const attachment: LiveAttachment = { sent };
  socket.serializeAttachment(attachment);
};

/**
 * The household's latest sequence number, 0 before its first event. Read from SQLite's own record
 * of the AUTOINCREMENT, which an event deleted since (import of an older export) does not lower.
 */
const latestSequence = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const [latest] = yield* sql<{ readonly seq: number }>`
    SELECT seq FROM sqlite_sequence WHERE name = 'domain_events'`;
  return latest?.seq ?? 0;
});

/**
 * Sends the household's committed events to its open connections (technique-v2 §6.3): to each,
 * those after the number it was brought up to, the internal ones never. The object calls it once
 * an invocation's work is done: its transactions are closed, so only committed events are read.
 */
export const publish = (ctx: Pick<DurableObjectState, "getWebSockets">) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const delivery = yield* EventDelivery;
    yield* delivery.withPermit(
      Effect.gen(function* () {
        const connections = ctx.getWebSockets().flatMap((socket) => {
          // A connection the household closed stays in `getWebSockets()` until its phone answers,
          // and `send` on it throws (J1.11).
          const sent =
            socket.readyState === WebSocket.OPEN ? sentOf(socket) : undefined;
          return sent === undefined ? [] : [{ socket, sent }];
        });
        if (connections.length === 0) return;
        const from = Math.min(...connections.map(({ sent }) => sent));
        const stored = yield* sql<StoredEvent>`
          SELECT sequence, kind, audience, payload FROM domain_events
          WHERE sequence > ${from} ORDER BY sequence`;
        const last = stored.at(-1);
        if (last === undefined) return;
        for (const { socket, sent } of connections) {
          for (const event of stored)
            if (event.sequence > sent && event.audience === "household")
              socket.send(JSON.stringify(eventMessage(event)));
          markSent(socket, last.sequence);
        }
      }),
    );
  });

/**
 * Opens a phone's live connection (technique-v2 §6.3) with the hibernation API (ADR-019), once
 * `Upgrade`, `Origin` and `since` are checked (live.ts). With `since`, it first sends what the phone
 * missed, or asks it to resync (`replayOf`); without, only what is committed after the opening.
 * Under `EventDelivery`: an event committed while it opens is sent once, after the replay.
 */
export const openLive = (
  ctx: Pick<DurableObjectState, "acceptWebSocket">,
  since: number | "absent",
) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const delivery = yield* EventDelivery;
    return yield* delivery.withPermit(
      Effect.gen(function* () {
        const latest = yield* latestSequence;
        let messages: ReturnType<typeof replayOf> = [];
        if (since !== "absent") {
          // At most what `replayOf` may send, plus the event the phone last received.
          const stored = yield* sql<StoredEvent>`
            SELECT sequence, kind, audience, payload FROM domain_events
            WHERE sequence >= ${since} AND sequence <= ${latest}
            ORDER BY sequence LIMIT ${maxReplay + 2}`;
          messages = replayOf(since, latest, stored);
        }
        const { 0: client, 1: server } = new WebSocketPair();
        ctx.acceptWebSocket(server);
        // Sent before the 101: workerd delivers them first, in order (probe of J2.4).
        for (const message of messages) server.send(JSON.stringify(message));
        markSent(server, latest);
        return new Response(null, { status: 101, webSocket: client });
      }),
    );
  });

// A reaction whose name no longer exists (retired by a deploy) is a defect: handled like a failure.
const noReaction = () => Effect.die(new Error("no reaction of this name"));

/**
 * Runs the household's pending reactions (technique-v2 §5.4), in the order of their events, until
 * none is left: those of the events just committed, and those an earlier invocation never ran (the
 * object was reset before it got to them). Each run is one transaction with its `handled_at`
 * marker: a reaction's SQL writes commit once. A run that fails is rolled back, then marked without
 * a second attempt and logged; retrying is up to the reaction (`Schedule`). It never holds back the
 * other reactions or events. Under `ReactionRuns`: two invocations never run the same reaction.
 */
export const runPendingReactions = (reactions: EventReactions) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const runs = yield* ReactionRuns;
    yield* runs.withPermit(runEachPending(sql, reactions));
  });

const runEachPending = (sql: SqlClient.SqlClient, reactions: EventReactions) =>
  Effect.gen(function* () {
    while (true) {
      const [next] = yield* sql<{
        readonly reaction: string;
        readonly sequence: number;
      }>`
        SELECT reaction, sequence FROM event_reactions
        WHERE handled_at IS NULL ORDER BY sequence, reaction LIMIT 1`;
      if (next === undefined) break;
      const { reaction, sequence } = next;
      const mark = Effect.gen(function* () {
        const handledAt = yield* Clock.currentTimeMillis;
        yield* sql`
          UPDATE event_reactions SET handled_at = ${handledAt}
          WHERE reaction = ${reaction} AND sequence = ${sequence} AND handled_at IS NULL`;
      });
      const outcome = yield* Effect.exit(
        sql.withTransaction(
          Effect.gen(function* () {
            const [event] = yield* sql<
              StoredEvent & { readonly occurred_at: number }
            >`
              SELECT sequence, kind, audience, occurred_at, payload
              FROM domain_events WHERE sequence = ${sequence}`;
            // Kept by the foreign key while its marker exists.
            if (event === undefined)
              return yield* Effect.die(new Error("the event is missing"));
            const react = reactions[reaction]?.react ?? noReaction;
            yield* react({
              sequence: event.sequence,
              kind: event.kind,
              audience: event.audience,
              payload: parseJson(event.payload),
              occurredAt: event.occurred_at,
            });
            return yield* mark;
          }),
        ),
      );
      if (Exit.isFailure(outcome)) {
        yield* mark;
        yield* Effect.logError("event reaction failed", outcome.cause).pipe(
          Effect.annotateLogs({
            "event.reaction": reaction,
            "event.sequence": sequence,
          }),
        );
      }
    }
  });

/**
 * What the object does once an invocation's work is done (a request, an alarm, an opening): its
 * transactions are closed, so only committed events are sent (technique-v2 §5.4). It never fails
 * the invocation: the work is already committed, and a phone resumes with `since`.
 */
export const settle = (
  ctx: Pick<DurableObjectState, "getWebSockets">,
  reactions: EventReactions,
) =>
  Effect.gen(function* () {
    // A reaction may append events: they are sent with the others.
    yield* runPendingReactions(reactions).pipe(
      Effect.catchCause((cause) =>
        Effect.logError("event reactions not run", cause),
      ),
    );
    yield* publish(ctx).pipe(
      Effect.catchCause((cause) => Effect.logError("events not sent", cause)),
    );
  });
