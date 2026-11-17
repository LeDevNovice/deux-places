import { Schema } from "effect";

// What the household sends a phone on its live connection (technique-v2 §6.3): server → phone
// only, each message with a sequence number from the household's `domain_events`. Built by the
// household object (src/server/runtime/domain-events.ts), read by the PWA (plan J2.7).

/**
 * An event the household's phones may see. Its kind and payload are those the module wrote; each
 * line that adds a kind sent to phones keeps its payload minimal (never a hidden rating, taste
 * seeds or equity, §13.2). A phone keeps the largest `sequence` it received and resumes after it.
 */
export const LiveEvent = Schema.Struct({
  type: Schema.Literal("event"),
  sequence: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)),
  kind: Schema.String,
  payload: Schema.Json,
});

/**
 * The household cannot replay what the phone missed (its `since` is unknown to this database,
 * events are missing, or too many): the phone reloads what it shows and resumes after `sequence`.
 */
export const LiveResync = Schema.Struct({
  type: Schema.Literal("resync"),
  sequence: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
});

export const LiveMessage = Schema.Union([LiveEvent, LiveResync]);
export type LiveMessage = typeof LiveMessage.Type;
