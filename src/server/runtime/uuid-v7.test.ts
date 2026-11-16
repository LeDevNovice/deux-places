import * as fc from "fast-check";
import { Cause, Clock, Effect, Exit } from "effect";
import { TestClock } from "effect/testing";
import { describe, expect, it, vi } from "vitest";
import { UuidV7InstantOutOfRange } from "../../shared-kernel/uuid-v7";
import { makeUuidV7Generator } from "./uuid-v7";

// Plan J2.1: the UUIDv7 generator reads the time through Effect's Clock only (AGENTS.md;
// technique-v2 §5.5), so a TestClock decides every timestamp here. RFC 9562 §5.7 (unix_ts_ms in
// the first 48 bits), §6.2 (monotonic within one generator), §6.9 (random bits from a CSPRNG).

type TestClockOf = Effect.Success<ReturnType<typeof TestClock.make>>;

const atTime = <A>(
  unixMs: number,
  program: (clock: TestClockOf) => Effect.Effect<A>,
) =>
  Effect.runPromiseExit(
    Effect.scoped(
      Effect.gen(function* () {
        const clock = yield* TestClock.make();
        yield* clock.setTime(unixMs);
        return yield* program(clock).pipe(
          Effect.provideService(Clock.Clock, clock),
        );
      }),
    ),
  );

const succeeded = <A>(exit: Exit.Exit<A>) => {
  if (Exit.isFailure(exit)) throw new Error(Cause.pretty(exit.cause));
  return exit.value;
};

const hexOf = (id: string) => id.replaceAll("-", "");
const timestampOf = (id: string) => Number.parseInt(hexOf(id).slice(0, 12), 16);
const randBOf = (id: string) => hexOf(id).slice(16); // octets 8-15, variant included

const t = 1_763_300_000_000; // 2025-11-16T13:33:20Z

describe("UUIDv7 generator (plan J2.1: based on Clock)", () => {
  it("stamps the Clock's time, not the system's", async () => {
    const id = succeeded(
      await atTime(t, () => Effect.flatten(makeUuidV7Generator)),
    );
    expect(timestampOf(id)).toBe(t);
  });

  // "Generated later sorts after": the Clock advances by 0 to 2 ms between two identifiers, so a
  // run repeats the same millisecond often; each identifier carries the Clock's time.
  it("sorts each identifier after the previous one as the Clock advances, same millisecond included", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 0, max: 2 ** 47 }),
        fc.array(fc.integer({ min: 0, max: 2 }), {
          minLength: 2,
          maxLength: 64,
          size: "max",
        }),
        async (start, advances) => {
          const run = succeeded(
            await atTime(start, (clock) =>
              Effect.gen(function* () {
                const next = yield* makeUuidV7Generator;
                const ids: Array<readonly [string, number]> = [];
                for (const advance of advances) {
                  yield* clock.adjust(advance);
                  ids.push([yield* next, clock.currentTimeMillisUnsafe()]);
                }
                return ids;
              }),
            ),
          );
          for (const [index, [id, now]] of run.entries()) {
            expect(timestampOf(id)).toBe(now);
            const before = run[index - 1]?.[0] ?? "";
            expect(id > before, `${id} after ${before}`).toBe(true);
          }
        },
      ),
    );
  });

  // RFC 9562 §6.2 Method 1: fresh random bits in rand_b for each new UUID; §6.9: from a CSPRNG.
  // 200 identifiers in one millisecond: 62 random bits each, a repeat has odds near 2^-48.
  it("draws fresh random bits from Web Crypto for each identifier", async () => {
    const spy = vi.spyOn(crypto, "getRandomValues");
    try {
      const ids = succeeded(
        await atTime(t, () =>
          Effect.gen(function* () {
            const next = yield* makeUuidV7Generator;
            const generated: Array<string> = [];
            for (let count = 0; count < 200; count++) {
              generated.push(yield* next);
            }
            return generated;
          }),
        ),
      );
      expect(new Set(ids.map(randBOf)).size).toBe(200);
      expect(spy.mock.calls.map(([array]) => array?.byteLength)).toEqual(
        Array.from({ length: 200 }, () => 10),
      );
    } finally {
      spy.mockRestore();
    }
  });

  it("dies on a Clock beyond 2^48 − 1 ms, out of UUIDv7's range", async () => {
    const exit = await atTime(2 ** 48, () =>
      Effect.flatten(makeUuidV7Generator),
    );
    expect(Exit.isFailure(exit) && Cause.squash(exit.cause)).toEqual(
      new UuidV7InstantOutOfRange({ unixMs: 2 ** 48 }),
    );
    expect(Exit.isFailure(exit) && Cause.hasDies(exit.cause)).toBe(true);
  });
});
