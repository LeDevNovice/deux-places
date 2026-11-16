import { DateTime, Result } from "effect";
import { describe, expect, it } from "vitest";
import { eveningDateOf } from "./evening-date";
import {
  clockChangeCases,
  clockChangeNights,
  FIRST_RULE_YEAR,
} from "./testing/paris-legal-time";

// Plan J2.2, in production's runtime: workerd ships its own ICU and time-zone data, not Node's.
// The same edges of every clock-change evening (2002-2099), with expectations from French legal
// time (décret n° 2017-292, directive 2000/84/EC art. 1 to 3), must hold here too.

const paris = DateTime.zoneMakeNamedUnsafe("Europe/Paris");
const LAST_YEAR = 2099;
const evening = (instant: number) =>
  Result.getOrThrow(eveningDateOf(instant, paris));

describe("evening date inside workerd (Europe/Paris)", () => {
  it("runs in workerd, not Node", () => {
    expect(navigator.userAgent).toBe("Cloudflare-Workers");
  });

  it("puts 0:40 on the previous evening", () => {
    const instant = DateTime.toEpochMillis(
      DateTime.makeUnsafe("2026-11-16T23:40:00.000Z"),
    );
    expect(Result.getOrThrow(eveningDateOf(instant, paris))).toBe("2026-11-16");
  });

  it("gives the expected evening at the edges of every clock-change evening, 2002-2099", () => {
    let checked = 0;
    for (let year = FIRST_RULE_YEAR; year <= LAST_YEAR; year++) {
      for (const { what, instant, expected } of clockChangeCases(year)) {
        expect(
          Result.getOrThrow(eveningDateOf(instant, paris)),
          `${year}, ${what}`,
        ).toBe(expected);
        checked++;
      }
    }
    expect(checked).toBe((LAST_YEAR - FIRST_RULE_YEAR + 1) * 15);
  });

  it("never goes back, minute by minute, three hours either side of every clock change, 2002-2099", () => {
    let steps = 0;
    for (let year = FIRST_RULE_YEAR; year <= LAST_YEAR; year++) {
      for (const night of clockChangeNights(year)) {
        night.reduce((earlier, later) => {
          expect(
            evening(earlier) <= evening(later),
            `${year}, ${earlier} then ${later}`,
          ).toBe(true);
          steps++;
          return later;
        });
      }
    }
    expect(steps).toBe((LAST_YEAR - FIRST_RULE_YEAR + 1) * 2 * 360);
  });
});
