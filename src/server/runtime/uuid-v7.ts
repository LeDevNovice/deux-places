import { Clock, Effect, Result } from "effect";
import {
  nextUuidV7,
  RANDOM_OCTETS,
  type UuidV7Sequence,
} from "../../shared-kernel/uuid-v7";

/**
 * A UUIDv7 generator (plan J2.1; technique-v2 §5.1: generated on the server side). Time comes from
 * Effect's `Clock` (AGENTS.md), random octets from Web Crypto's CSPRNG (RFC 9562 §6.9); the layout
 * and the ordering are the shared kernel's `nextUuidV7`. Every identifier a generator returns sorts
 * after the previous one it returned (RFC 9562 §6.2), even within one millisecond: on Workers the
 * time does not move while code runs. Identifiers of separate generators are ordered only by
 * millisecond. An instant outside RFC 9562's 48 bits is a defect.
 */
export const makeUuidV7Generator: Effect.Effect<Effect.Effect<string>> =
  Effect.sync(() => {
    let previous: UuidV7Sequence | undefined;
    return Effect.gen(function* () {
      const now = yield* Clock.currentTimeMillis;
      const random = crypto.getRandomValues(new Uint8Array(RANDOM_OCTETS));
      const next = nextUuidV7(previous, now, random);
      if (Result.isFailure(next)) return yield* Effect.die(next.failure);
      previous = next.success.sequence;
      return next.success.id;
    });
  });
