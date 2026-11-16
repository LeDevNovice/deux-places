import * as fc from "fast-check";
import { Result } from "effect";
import { describe, expect, it } from "vitest";
import {
  nextUuidV7,
  UuidV7InstantOutOfRange,
  type UuidV7Sequence,
} from "./uuid-v7";

// Plan J2.1; technique-v2 §5.1 (UUIDv7 identifiers, sortable by date), §7.1 (instants in UTC
// milliseconds). Expectations come from RFC 9562: §4 (hex-and-dash text, 36 characters), §4.1
// (variant 0b10 in bits 64-65), §4.2 and §5.7 (version 0b0111 in bits 48-51; unix_ts_ms, 48-bit
// big-endian, in octets 0-5), §6.11 (UUIDv7 text sorts like its bytes).

const MAX_UNIX_MS = 2 ** 48 - 1; // §5.7: 48 bits

const instant = fc.integer({ min: 0, max: MAX_UNIX_MS });
const randomBytes = fc.uint8Array({ minLength: 10, maxLength: 10 });

// Read back from the text, field by field (RFC 9562 §5.7, Figure 11).
const hexOf = (id: string) => id.replaceAll("-", "");
const timestampOf = (id: string) => Number.parseInt(hexOf(id).slice(0, 12), 16);
const randAOf = (id: string) => Number.parseInt(hexOf(id).slice(13, 16), 16);
const octetsOf = (id: string) =>
  Uint8Array.from(hexOf(id).match(/../g) ?? [], (pair) =>
    Number.parseInt(pair, 16),
  );

const generated = (unixMs: number, random: Uint8Array) =>
  Result.getOrThrow(nextUuidV7(undefined, unixMs, random)).id;

describe("UUIDv7 text (RFC 9562 §4, §4.1, §4.2, §5.7)", () => {
  it("is 36 lowercase hex-and-dash characters, version 7, variant 0b10", () => {
    fc.assert(
      fc.property(instant, randomBytes, (unixMs, random) => {
        const id = generated(unixMs, random);
        expect(id).toHaveLength(36);
        expect(id).toMatch(
          /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
        );
      }),
    );
  });

  it("carries the instant in its first 48 bits, big-endian (unix_ts_ms)", () => {
    fc.assert(
      fc.property(instant, randomBytes, (unixMs, random) => {
        expect(timestampOf(generated(unixMs, random))).toBe(unixMs);
      }),
    );
  });
});

// "Generated later sorts after" (plan J2.1). Within one sequence (each identifier computed from the
// previous one's `sequence`), in generation order, whatever the instants: a later millisecond, the
// same millisecond (§6.2: "if one thousand UUIDs are generated for the same timestamp", Workers'
// clock does not move while code runs), or an earlier one (§6.2 "Monotonic Error Checking": reuse
// the previous timestamp and increment the counter). Text and octets (§6.11).
const sequenceOf = (
  start: number,
  steps: ReadonlyArray<readonly [number, Uint8Array]>,
) => {
  const ids: Array<string> = [];
  let previous: UuidV7Sequence | undefined;
  let unixMs = start;
  for (const [delta, random] of steps) {
    unixMs = Math.min(MAX_UNIX_MS, Math.max(0, unixMs + delta));
    const next = Result.getOrThrow(nextUuidV7(previous, unixMs, random));
    ids.push(next.id);
    previous = next.sequence;
  }
  return ids;
};

const compareOctets = (a: Uint8Array, b: Uint8Array) => {
  for (let index = 0; index < 16; index++) {
    const difference = (a[index] ?? 0) - (b[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
};

describe("UUIDv7 order (plan J2.1: generated later sorts after; RFC 9562 §6.2, §6.11)", () => {
  // Small steps, so that a run repeats the same millisecond and steps back often.
  const steps = fc.array(
    fc.tuple(fc.integer({ min: -2, max: 2 }), randomBytes),
    { minLength: 2, maxLength: 64, size: "max" },
  );
  const start = fc.integer({ min: 0, max: 2 ** 47 });

  it("sorts every identifier of a sequence after the previous one, same millisecond included", () => {
    fc.assert(
      fc.property(start, steps, (startMs, run) => {
        const ids = sequenceOf(startMs, run);
        for (let index = 1; index < ids.length; index++) {
          const [before, after] = [ids[index - 1] ?? "", ids[index] ?? ""];
          expect(after > before, `${after} after ${before}`).toBe(true);
          expect(
            compareOctets(octetsOf(after), octetsOf(before)),
          ).toBeGreaterThan(0);
        }
      }),
    );
  });

  // §6.2 "Counter Rollover Handling": implementations MAY increment the timestamp ahead of the
  // actual time and reinitialize the counter. From the highest seed (0x7ff), 2049 identifiers fit
  // in one millisecond (counter 0x7ff to 0xfff); the 2050th moves one millisecond ahead.
  it("moves one millisecond ahead when the counter rolls over, and still sorts after", () => {
    const t = 1_763_300_000_000;
    const highestSeed = Uint8Array.from([0xff, 0xff, 0, 0, 0, 0, 0, 0, 0, 0]);
    const ids = sequenceOf(
      t,
      Array.from({ length: 2050 }, () => [0, highestSeed] as const),
    );
    expect(ids.slice(0, 2049).every((id) => timestampOf(id) === t)).toBe(true);
    expect(randAOf(ids[2048] ?? "")).toBe(0xfff);
    expect(timestampOf(ids[2049] ?? "")).toBe(t + 1);
    expect(randAOf(ids[2049] ?? "")).toBe(0x7ff);
    expect((ids[2049] ?? "") > (ids[2048] ?? "")).toBe(true);
  });

  it("sorts an identifier of a later millisecond after, even from another sequence", () => {
    fc.assert(
      fc.property(
        instant,
        instant,
        randomBytes,
        randomBytes,
        (a, b, randomA, randomB) => {
          fc.pre(a !== b);
          const [earlier, later] = a < b ? [a, b] : [b, a];
          expect(generated(later, randomB) > generated(earlier, randomA)).toBe(
            true,
          );
        },
      ),
    );
  });
});

// §5.7: a 48-bit count of milliseconds since 1970-01-01 UTC; §6.1 "Error Handling": the generator
// may return an error and MUST NOT knowingly return duplicate values due to a counter rollover.
describe("UUIDv7 refused instants (RFC 9562 §5.7, §6.1)", () => {
  it("refuses an instant outside 0 … 2^48 − 1 ms, or not a whole number of milliseconds", () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.integer({ min: Number.MIN_SAFE_INTEGER, max: -1 }),
          fc.integer({ min: MAX_UNIX_MS + 1, max: Number.MAX_SAFE_INTEGER }),
          fc.double({ min: 0, max: MAX_UNIX_MS, noInteger: true }),
          fc.constantFrom(Number.NaN, Infinity, -Infinity),
        ),
        fc.option(
          fc.record({
            unixMs: instant,
            counter: fc.integer({ min: 0, max: 0xfff }),
          }),
          { nil: undefined },
        ),
        randomBytes,
        (unixMs, previous, random) => {
          const result = nextUuidV7(previous, unixMs, random);
          expect(Result.isFailure(result) && result.failure).toEqual(
            new UuidV7InstantOutOfRange({ unixMs }),
          );
        },
      ),
    );
  });

  it("refuses to roll the counter over past the last millisecond (year 10889)", () => {
    const random = new Uint8Array(10);
    const last = { unixMs: MAX_UNIX_MS, counter: 0xfff };
    const result = nextUuidV7(last, MAX_UNIX_MS, random);
    expect(Result.isFailure(result) && result.failure).toEqual(
      new UuidV7InstantOutOfRange({ unixMs: MAX_UNIX_MS + 1 }),
    );
  });
});

// The 74 bits after version and variant (§5.7) take the random octets: rand_b gets 62 fresh bits
// for every identifier (§6.2 Method 1: "trailing random bits generated for each new UUID"), from
// octets 2-9 of the input, octet 2 losing its two leftmost bits to the variant; rand_a holds the
// counter (§6.2 Method 1), seeded at each new millisecond from octets 0-1: its 11 rightmost bits
// random, its leftmost bit 0 ("Fixed Bit-Length Dedicated Counter Seeding": rollover guard).
describe("UUIDv7 random bits (RFC 9562 §5.7, §6.2, §6.9)", () => {
  it("fills rand_b with the 62 random bits it is given", () => {
    fc.assert(
      fc.property(instant, randomBytes, (unixMs, random) => {
        const octets = octetsOf(generated(unixMs, random));
        expect(octets[8]).toBe(0x80 | ((random[2] ?? 0) & 0x3f));
        expect(octets.slice(9)).toEqual(random.slice(3));
      }),
    );
  });

  it("seeds the counter in rand_a with 11 random bits under a zero rollover guard", () => {
    fc.assert(
      fc.property(instant, randomBytes, (unixMs, random) => {
        const seed = (((random[0] ?? 0) << 8) | (random[1] ?? 0)) & 0x7ff;
        expect(randAOf(generated(unixMs, random))).toBe(seed);
      }),
    );
  });

  // 11 seed bits + 62 rand_b bits come from exactly 10 octets; any other size is a programming
  // error, never silently padded or truncated (fewer random bits would break §6.9).
  it("throws a RangeError for random octets other than exactly 10", () => {
    fc.assert(
      fc.property(
        instant,
        fc.oneof(
          fc.uint8Array({ maxLength: 9 }),
          fc.uint8Array({ minLength: 11, maxLength: 32 }),
        ),
        (unixMs, random) => {
          expect(() => nextUuidV7(undefined, unixMs, random)).toThrow(
            RangeError,
          );
        },
      ),
    );
  });
});
