import { describe, expectTypeOf, it } from "vitest";
import type {
  DomainEvent,
  DomainEventKind,
  RecordedDomainEvent,
} from "./domain-event";

// Plan J2.4; technique-v2 §4.4 (the kernel carries the domain event envelope), §5.4, §6.3, §7.1;
// src/server/AGENTS.md (a kind is prefixed by its module). Type assertions only: the envelope has
// no behaviour of its own; `tsc --noEmit` (pnpm check) checks them.

describe("Domain event envelope (technique-v2 §4.4)", () => {
  it("names its kind with a prefix and a dot, as `swap.vote_cast`", () => {
    expectTypeOf<"swap.vote_cast">().toExtend<DomainEventKind>();
    expectTypeOf<"vote_cast">().not.toExtend<DomainEventKind>();
  });

  it("states who may see it: the household's phones, or the household's own reactions only", () => {
    expectTypeOf<DomainEvent["audience"]>().toEqualTypeOf<
      "household" | "internal"
    >();
    // No default: an event without an audience is refused.
    expectTypeOf<{
      kind: "swap.vote_cast";
      payload: null;
    }>().not.toExtend<DomainEvent>();
  });

  it("carries a JSON payload, never a value JSON cannot hold", () => {
    expectTypeOf<{
      kind: "swap.vote_cast";
      audience: "household";
      payload: { readonly candidate: 2; readonly titles: readonly ["a"] };
    }>().toExtend<DomainEvent>();
    expectTypeOf<{
      kind: "swap.vote_cast";
      audience: "household";
      payload: { readonly at: Date };
    }>().not.toExtend<DomainEvent>();
    expectTypeOf<{
      kind: "swap.vote_cast";
      audience: "household";
      payload: bigint;
    }>().not.toExtend<DomainEvent>();
  });

  it("once recorded, adds the sequence the storage gave it and the instant Clock read, in UTC milliseconds", () => {
    expectTypeOf<RecordedDomainEvent>().toExtend<DomainEvent>();
    expectTypeOf<RecordedDomainEvent["sequence"]>().toEqualTypeOf<number>();
    expectTypeOf<RecordedDomainEvent["occurredAt"]>().toEqualTypeOf<number>();
    expectTypeOf<DomainEvent>().not.toExtend<RecordedDomainEvent>();
  });
});
