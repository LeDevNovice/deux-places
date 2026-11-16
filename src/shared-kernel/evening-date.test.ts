import * as fc from "fast-check";
import { DateTime, Result } from "effect";
import { describe, expect, expectTypeOf, it } from "vitest";
import { eveningDateOf, EveningInstantOutOfRange } from "./evening-date";
import {
  clockChangeCases,
  clockChangeNights,
  DAY,
  eveningStart,
  FIRST_RULE_YEAR,
  HOUR,
  isoDate,
  lastSundayOf,
  nextDate,
  parisWallClock,
  previousDate,
  ruleEveningDate,
  summerTimeEnd,
  summerTimeStart,
} from "./testing/paris-legal-time";

// Plan J2.2; technique-v2 §5.1 ("une séance lancée à 0 h 40 appartient à la veille"), §7.1
// (instants in UTC milliseconds, evening dates as ISO text), §11.3 ("tout instant, changements
// d'heure compris, se rattache à une seule soirée"); CONTEXT.md `EveningDate`: "Coupure à 5 h,
// fuseau du foyer"; produit.md `household.timezone` « Europe/Paris ».
// Expected instants are written by hand from French legal time: UTC + 1 h (décret n° 2017-292),
// UTC + 2 h in summer time, from 1.00 a.m. GMT on the last Sunday in March to 1.00 a.m. GMT on
// the last Sunday in October (directive 2000/84/EC, art. 1 to 3). In 2026: 29 March, 25 October.

const paris = DateTime.zoneMakeNamedUnsafe("Europe/Paris");

const at = (iso: string) => DateTime.toEpochMillis(DateTime.makeUnsafe(iso));
const eveningOf = (iso: string) =>
  Result.getOrThrow(eveningDateOf(at(iso), paris));
const evening = (instant: number) =>
  Result.getOrThrow(eveningDateOf(instant, paris));

describe("evening date, 5 a.m. cutoff, Europe/Paris standard time (UTC + 1 h)", () => {
  it("puts a showing launched at 0:40 on the previous evening", () => {
    // Tuesday 17 November 2026, 0:40 in Paris
    expect(eveningOf("2026-11-16T23:40:00.000Z")).toBe("2026-11-16");
  });

  it("keeps 4:59:59.999 on the previous evening", () => {
    expect(eveningOf("2026-11-17T03:59:59.999Z")).toBe("2026-11-16");
  });

  it("starts the evening at 5:00 exactly", () => {
    expect(eveningOf("2026-11-17T04:00:00.000Z")).toBe("2026-11-17");
  });

  it("keeps 23:59:59.999 on the same day's evening", () => {
    expect(eveningOf("2026-11-17T22:59:59.999Z")).toBe("2026-11-17");
  });
});

describe("evening date, 5 a.m. cutoff, Europe/Paris summer time (UTC + 2 h)", () => {
  it("puts 0:40 on the previous evening", () => {
    // Tuesday 14 July 2026, 0:40 in Paris
    expect(eveningOf("2026-07-13T22:40:00.000Z")).toBe("2026-07-13");
  });

  it("keeps 4:59:59.999 on the previous evening", () => {
    expect(eveningOf("2026-07-14T02:59:59.999Z")).toBe("2026-07-13");
  });

  it("starts the evening at 5:00 exactly", () => {
    expect(eveningOf("2026-07-14T03:00:00.000Z")).toBe("2026-07-14");
  });
});

// Accepted instants: whole milliseconds from 1970-01-01T00:00:00.000Z (technique-v2 §7.1) up to,
// but excluding, 9999-12-31T00:00:00.000Z, so that the evening date keeps four year digits
// (`YYYY-MM-DD`) in every IANA zone (offsets from -12 h to +14 h).
const FIRST_INSTANT = 0;
const END_OF_RANGE = at("9999-12-31T00:00:00.000Z");

describe("evening date zone", () => {
  it("is a named IANA zone, never a fixed UTC offset that would ignore clock changes", () => {
    expectTypeOf(eveningDateOf)
      .parameter(1)
      .toEqualTypeOf<DateTime.TimeZone.Named>();
    expectTypeOf(
      DateTime.zoneMakeOffset(HOUR),
    ).not.toExtend<DateTime.TimeZone.Named>();
  });
});

describe("evening date of an instant out of range", () => {
  it.each([
    ["not a number", Number.NaN],
    ["infinite", Number.POSITIVE_INFINITY],
    ["minus infinity", Number.NEGATIVE_INFINITY],
    ["a fraction of a millisecond", 1_763_336_400_000.5],
    ["before 1970", FIRST_INSTANT - 1],
    ["at the end of the range", END_OF_RANGE],
    ["far beyond it", Number.MAX_SAFE_INTEGER],
  ])("is refused when the instant is %s", (_, instant) => {
    expect(eveningDateOf(instant, paris)).toEqual(
      Result.fail(new EveningInstantOutOfRange({ instant })),
    );
  });

  it("is given for the first and the last instants of the range", () => {
    // 1 January 1970, 1:00 in Paris (UTC + 1 h)
    expect(Result.getOrThrow(eveningDateOf(FIRST_INSTANT, paris))).toBe(
      "1969-12-31",
    );
    // 31 December 9999, 0:59:59.999 in Paris
    expect(Result.getOrThrow(eveningDateOf(END_OF_RANGE - 1, paris))).toBe(
      "9999-12-30",
    );
    // 31 December 9999, 13:59:59.999 at UTC + 14 h, the easternmost offset
    const kiritimati = DateTime.zoneMakeNamedUnsafe("Pacific/Kiritimati");
    expect(Result.getOrThrow(eveningDateOf(END_OF_RANGE - 1, kiritimati))).toBe(
      "9999-12-31",
    );
  });
});

describe("evening date across the clock changes of 2026 (Europe/Paris)", () => {
  it("gives the evening of Saturday 28 March 23 hours: clocks go forward at 2:00 (1:00 UTC)", () => {
    // Starts at 5:00 standard time on 28 March (4:00 UTC)
    expect(eveningOf("2026-03-28T03:59:59.999Z")).toBe("2026-03-27");
    expect(eveningOf("2026-03-28T04:00:00.000Z")).toBe("2026-03-28");
    // 1:59:59.999 standard time, then 3:00 summer time
    expect(eveningOf("2026-03-29T00:59:59.999Z")).toBe("2026-03-28");
    expect(eveningOf("2026-03-29T01:00:00.000Z")).toBe("2026-03-28");
    // Ends at 5:00 summer time on 29 March (3:00 UTC): 23 hours after it started
    expect(eveningOf("2026-03-29T02:59:59.999Z")).toBe("2026-03-28");
    expect(eveningOf("2026-03-29T03:00:00.000Z")).toBe("2026-03-29");
  });

  it("gives the evening of Saturday 24 October 25 hours: clocks go back at 3:00 (1:00 UTC)", () => {
    // Starts at 5:00 summer time on 24 October (3:00 UTC)
    expect(eveningOf("2026-10-24T02:59:59.999Z")).toBe("2026-10-23");
    expect(eveningOf("2026-10-24T03:00:00.000Z")).toBe("2026-10-24");
    // 2:30 occurs twice: summer time (0:30 UTC), then standard time (1:30 UTC)
    expect(eveningOf("2026-10-25T00:30:00.000Z")).toBe("2026-10-24");
    expect(eveningOf("2026-10-25T01:30:00.000Z")).toBe("2026-10-24");
    // 4:00 standard time, an hour before the end (5:00 summer time would have been now)
    expect(eveningOf("2026-10-25T03:00:00.000Z")).toBe("2026-10-24");
    // Ends at 5:00 standard time on 25 October (4:00 UTC): 25 hours after it started
    expect(eveningOf("2026-10-25T03:59:59.999Z")).toBe("2026-10-24");
    expect(eveningOf("2026-10-25T04:00:00.000Z")).toBe("2026-10-25");
  });
});

// The oracle itself, checked against the dates published by the Commission for 2002-2006 (OJ C 337
// E, 28.11.2000, p. 137: "the Sundays of 31 March and 27 October" in 2002, and so on) and against
// the 2026 calendar.
describe("French legal time oracle (directive 2000/84/EC)", () => {
  it.each([
    [2002, 31, 27],
    [2003, 30, 26],
    [2004, 28, 31],
    [2005, 27, 30],
    [2006, 26, 29],
    [2026, 29, 25],
  ])(
    "finds the last Sundays of March and October %i",
    (year, march, october) => {
      expect([lastSundayOf(year, 3), lastSundayOf(year, 10)]).toEqual([
        march,
        october,
      ]);
    },
  );
});

// Years 2002-2099: 196 clock changes, under the rules of directive 2000/84/EC.
const LAST_YEAR = 2099;
const years = Array.from(
  { length: LAST_YEAR - FIRST_RULE_YEAR + 1 },
  (_, index) => FIRST_RULE_YEAR + index,
);

describe("evening date at the edges of every clock-change evening, 2002-2099 (Europe/Paris)", () => {
  // Three hours either side of each change, minute by minute: the evening never goes back, not
  // even when 2:00-3:00 is lived twice in October.
  it.each(years)(
    "never goes back, minute by minute, around the clock changes of %i",
    (year) => {
      for (const night of clockChangeNights(year)) {
        night.reduce((earlier, later) => {
          expect(
            evening(earlier) <= evening(later),
            `${year}, ${earlier} then ${later}`,
          ).toBe(true);
          return later;
        });
      }
    },
  );

  it.each(years)("gives the expected evening in %i", (year) => {
    for (const { what, instant, expected } of clockChangeCases(year)) {
      expect(
        Result.getOrThrow(eveningDateOf(instant, paris)),
        `${year}, ${what}`,
      ).toBe(expected);
    }
  });
});

// "Tout instant, changements d'heure compris, se rattache à une seule soirée" (§11.3), stated as:
// (1) the evening date of an instant is the date of French legal wall-clock time minus 5 hours;
// (2) from one millisecond to the next, it changes exactly at the instants that are 5:00:00.000
//     French legal time, and only there, and then to the next calendar date: it never goes back,
//     no evening is skipped, none is repeated (minute-by-minute scan of each clock-change night
//     above: random instants hardly ever fall in the half hour where a wrong cutoff would go back);
// (3) every evening starts at 5:00 French legal time and lasts until the next one starts: 24 hours,
//     23 hours before the last Sunday in March, 25 hours before the last Sunday in October.
// Generators are explicit about their ranges (J2.1: fast-check's default size never reaches far).
const firstRuleInstant = at(`${FIRST_RULE_YEAR}-01-01T00:00:00.000Z`);
const lastRuleInstant = at(`${LAST_YEAR + 1}-01-01T00:00:00.000Z`) - 1;
const anyInstant = fc.integer({ min: firstRuleInstant, max: lastRuleInstant });
const nearClockChange = fc
  .record({
    year: fc.integer({ min: FIRST_RULE_YEAR, max: LAST_YEAR }),
    forward: fc.boolean(),
    // The whole evening around the change, or the two hours either side of it.
    delta: fc.oneof(
      fc.integer({ min: -30 * HOUR, max: 30 * HOUR }),
      fc.integer({ min: -2 * HOUR, max: 2 * HOUR }),
    ),
  })
  .map(
    ({ year, forward, delta }) =>
      (forward ? summerTimeStart(year) : summerTimeEnd(year)) + delta,
  );
const anyDate = fc
  .integer({
    min: 1,
    max: Math.floor((lastRuleInstant - firstRuleInstant) / DAY) - 1,
  })
  .map((days) => isoDate(firstRuleInstant + days * DAY));
const nearCutoff = fc
  .record({ date: anyDate, delta: fc.integer({ min: -2, max: 2 }) })
  .map(({ date, delta }) => eveningStart(date) + delta);
const nearCutoffOnClockChangeDay = fc
  .record({
    year: fc.integer({ min: FIRST_RULE_YEAR, max: LAST_YEAR }),
    month: fc.constantFrom(3 as const, 10 as const),
    saturday: fc.boolean(),
    delta: fc.integer({ min: -2, max: 2 }),
  })
  .map(({ year, month, saturday, delta }) => {
    const sunday = `${year}-${pad2(month)}-${pad2(lastSundayOf(year, month))}`;
    return eveningStart(saturday ? previousDate(sunday) : sunday) + delta;
  });
const atClockChange = fc
  .record({
    year: fc.integer({ min: FIRST_RULE_YEAR, max: LAST_YEAR }),
    forward: fc.boolean(),
    delta: fc.integer({ min: -2, max: 2 }),
  })
  .map(
    ({ year, forward, delta }) =>
      (forward ? summerTimeStart(year) : summerTimeEnd(year)) + delta,
  );
const instants = fc.oneof(
  anyInstant,
  nearClockChange,
  atClockChange,
  nearCutoff,
  nearCutoffOnClockChangeDay,
);

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

describe("evening date properties, 2002-2099 (Europe/Paris)", () => {
  it("is the date of the wall-clock time minus 5 hours, under directive 2000/84/EC", () => {
    fc.assert(
      fc.property(instants, (instant) => {
        expect(evening(instant)).toBe(ruleEveningDate(instant));
      }),
    );
  });

  it("changes exactly at 5:00:00.000 French legal time, to the next date", () => {
    fc.assert(
      fc.property(instants, (instant) => {
        const { hour, minute, second, millisecond } = parisWallClock(instant);
        const atFive =
          hour === 5 && minute === 0 && second === 0 && millisecond === 0;
        const before = evening(instant - 1);
        expect(evening(instant)).toBe(atFive ? nextDate(before) : before);
      }),
    );
  });

  it("starts every evening at 5:00 French legal time, for 23, 24 or 25 hours", () => {
    fc.assert(
      fc.property(anyDate, (date) => {
        const next = nextDate(date);
        const start = eveningStart(date);
        const end = eveningStart(next);
        const year = Number(next.slice(0, 4));
        const sunday = (month: 3 | 10) =>
          `${year}-${pad2(month)}-${pad2(lastSundayOf(year, month))}`;
        const hours = next === sunday(3) ? 23 : next === sunday(10) ? 25 : 24;
        expect(end - start).toBe(hours * HOUR);
        expect(evening(start - 1)).toBe(previousDate(date));
        expect(evening(start)).toBe(date);
        expect(evening(end - 1)).toBe(date);
        expect(evening(end)).toBe(next);
      }),
    );
  });
});
