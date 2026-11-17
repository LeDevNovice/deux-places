// The domain event envelope (technique-v2 §4.4, §5.4, §7.1): what a module says happened, and what
// the household's `domain_events` table keeps of it. Types only: the object writes and numbers the
// events (src/server/runtime/domain-events.ts).

/** A value JSON can hold: what an event's payload is written as. */
export type Json =
  | null
  | boolean
  | number
  | string
  | readonly Json[]
  | { readonly [key: string]: Json };

/** An event's kind, prefixed like its module's tables and deadlines: `swap.vote_cast`. */
export type DomainEventKind = `${string}.${string}`;

/**
 * Who may see an event. `household`: sent to the household's phones (technique-v2 §6.3), so its
 * payload is minimal and never holds the partner's hidden rating (RG-04), taste seeds or equity
 * (§13.2). `internal`: read only by the household's own reactions (§5.4), never sent.
 */
export type DomainEventAudience = "household" | "internal";

/** What a module says happened, as it hands it to the household's events. */
export interface DomainEvent<
  Kind extends DomainEventKind = DomainEventKind,
  Payload extends Json = Json,
> {
  readonly kind: Kind;
  readonly audience: DomainEventAudience;
  readonly payload: Payload;
}

/** An event the household wrote, with what writing it gave it. */
export interface RecordedDomainEvent<
  Kind extends DomainEventKind = DomainEventKind,
  Payload extends Json = Json,
> extends DomainEvent<Kind, Payload> {
  /** Given by the storage: increasing, never reused, starting at 1. */
  readonly sequence: number;
  /** Read from `Clock` when the event was written, in UTC milliseconds (§7.1). */
  readonly occurredAt: number;
}
