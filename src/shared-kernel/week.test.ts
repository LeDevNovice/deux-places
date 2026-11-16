import * as fc from "fast-check";
import { DateTime, Result } from "effect";
import { describe, expect, expectTypeOf, it } from "vitest";
import { eveningDateOf, type EveningDate } from "./evening-date";
import {
  daysFromCivil,
  daysOfIsoText,
  isoTextOf,
  weekdayOf,
} from "./testing/civil-calendar";
import { fortnightIndexOf, weekStartOf, type WeekStart } from "./week";

// Plan J2.3; RG-20 ("Le programme est hebdomadaire (lundi à dimanche)"), RG-22 ("une carte
// blanche par quinzaine … en alternance"); CONTEXT.md `WeekPlan` "Lundi → dimanche";
// produit.md `week_plan.week_start (lundi)`, route `/weeks/{weekStart}`; technique-v2 §7.1
// ("dates de soirée et semaines en texte ISO").
// The week of an instant is the week of its evening (5 a.m. cutoff, J2.2), so Monday 4:59 still
// belongs to the previous week. Expected dates and indexes come from the calendar (Python
// `calendar` and `datetime`, run outside the repository) or from the integer oracle
// `testing/civil-calendar.ts`, never from the code under test.

const paris = DateTime.zoneMakeNamedUnsafe("Europe/Paris");
const utc = DateTime.zoneMakeNamedUnsafe("UTC");

const DAY = 24 * 3_600_000;
const at = (iso: string) => DateTime.toEpochMillis(DateTime.makeUnsafe(iso));
const eveningOf = (iso: string, zone = paris) =>
  Result.getOrThrow(eveningDateOf(at(iso), zone));

/**
 * The evening date of a calendar day (counted from 1970-01-01), the only way to build one being
 * `eveningDateOf`: noon UTC of that day in zone UTC, or the very first instant for 1969-12-31.
 */
const eveningOfDay = (days: number): EveningDate => {
  const date = Result.getOrThrow(
    eveningDateOf(Math.max(0, days * DAY + DAY / 2), utc),
  );
  if (date !== isoTextOf(days)) throw new Error(`no evening for day ${days}`);
  return date;
};

const weekStartDay = (days: number) =>
  daysOfIsoText(weekStartOf(eveningOfDay(days)));
const fortnightOfDay = (days: number) => fortnightIndexOf(eveningOfDay(days));

// Evening dates span 1969-12-31 (instant 0 west of UTC) to 9999-12-31 (UTC + 14 h, J2.2). Zone
// UTC reaches 9999-12-30; 9999-12-31 has its own example below.
const FIRST_DAY = daysFromCivil({ year: 1969, month: 12, day: 31 });
const LAST_DAY = daysFromCivil({ year: 9999, month: 12, day: 30 });
const ANCHOR = daysFromCivil({ year: 1969, month: 12, day: 29 }); // a Monday (Python)

describe("civil calendar oracle", () => {
  it("matches Python's datetime on day counts and weekdays", () => {
    // Python: (date(…) - date(1970, 1, 1)).days, date(…).strftime("%A")
    const cases = [
      ["1969-12-29", -3, 0],
      ["1969-12-31", -1, 2],
      ["2000-02-29", 11_016, 1],
      ["2026-11-16", 20_773, 0],
      ["2028-02-29", 21_243, 1],
      ["2100-03-01", 47_541, 0],
      ["9999-12-30", 2_932_895, 3],
      ["9999-12-31", 2_932_896, 4],
    ] as const;
    for (const [text, days, weekday] of cases) {
      expect(daysOfIsoText(text)).toBe(days);
      expect(isoTextOf(days)).toBe(text);
      expect(weekdayOf(days)).toBe(weekday);
    }
  });
});

describe("RG-20 — the week runs from Monday to Sunday, by evening (Europe/Paris standard time)", () => {
  // November 2026: Monday 16 … Sunday 22, Monday 23. Paris is UTC + 1 h.
  it("keeps Sunday 23:59 in the current week", () => {
    expect(weekStartOf(eveningOf("2026-11-22T22:59:00.000Z"))).toBe(
      "2026-11-16",
    );
  });

  it("keeps Monday 4:59 in the previous week", () => {
    expect(weekStartOf(eveningOf("2026-11-23T03:59:00.000Z"))).toBe(
      "2026-11-16",
    );
    expect(weekStartOf(eveningOf("2026-11-23T03:59:59.999Z"))).toBe(
      "2026-11-16",
    );
  });

  it("starts the new week on Monday at 5:00", () => {
    expect(weekStartOf(eveningOf("2026-11-23T04:00:00.000Z"))).toBe(
      "2026-11-23",
    );
  });
});

describe("RG-20 — the week runs from Monday to Sunday, by evening (Europe/Paris summer time)", () => {
  // July 2026: Monday 6 … Sunday 12, Monday 13. Paris is UTC + 2 h.
  it("keeps Sunday 23:59 in the current week", () => {
    expect(weekStartOf(eveningOf("2026-07-12T21:59:00.000Z"))).toBe(
      "2026-07-06",
    );
  });

  it("keeps Monday 4:59 in the previous week", () => {
    expect(weekStartOf(eveningOf("2026-07-13T02:59:00.000Z"))).toBe(
      "2026-07-06",
    );
  });

  it("starts the new week on Monday at 5:00", () => {
    expect(weekStartOf(eveningOf("2026-07-13T03:00:00.000Z"))).toBe(
      "2026-07-13",
    );
  });
});

describe("RG-20 — a week that contains a clock change keeps its seven evenings", () => {
  // Clocks go forward on Sunday 29 March 2026 at 1:00 UTC, back on Sunday 25 October at 1:00 UTC.
  it("runs from Monday 23 March 5:00 (UTC + 1 h) to Monday 30 March 4:59 (UTC + 2 h)", () => {
    expect(weekStartOf(eveningOf("2026-03-23T03:59:00.000Z"))).toBe(
      "2026-03-16",
    );
    expect(weekStartOf(eveningOf("2026-03-23T04:00:00.000Z"))).toBe(
      "2026-03-23",
    );
    // Sunday 29 March, 3:30 summer time: still the evening of Saturday 28.
    expect(weekStartOf(eveningOf("2026-03-29T01:30:00.000Z"))).toBe(
      "2026-03-23",
    );
    expect(weekStartOf(eveningOf("2026-03-29T21:59:00.000Z"))).toBe(
      "2026-03-23",
    );
    expect(weekStartOf(eveningOf("2026-03-30T02:59:00.000Z"))).toBe(
      "2026-03-23",
    );
    expect(weekStartOf(eveningOf("2026-03-30T03:00:00.000Z"))).toBe(
      "2026-03-30",
    );
  });

  it("runs from Monday 19 October 5:00 (UTC + 2 h) to Monday 26 October 4:59 (UTC + 1 h)", () => {
    expect(weekStartOf(eveningOf("2026-10-19T02:59:00.000Z"))).toBe(
      "2026-10-12",
    );
    expect(weekStartOf(eveningOf("2026-10-19T03:00:00.000Z"))).toBe(
      "2026-10-19",
    );
    // Sunday 25 October, the second 2:30 (standard time): still the evening of Saturday 24.
    expect(weekStartOf(eveningOf("2026-10-25T01:30:00.000Z"))).toBe(
      "2026-10-19",
    );
    expect(weekStartOf(eveningOf("2026-10-25T22:59:00.000Z"))).toBe(
      "2026-10-19",
    );
    expect(weekStartOf(eveningOf("2026-10-26T03:59:00.000Z"))).toBe(
      "2026-10-19",
    );
    expect(weekStartOf(eveningOf("2026-10-26T04:00:00.000Z"))).toBe(
      "2026-10-26",
    );
  });
});

describe("RG-20 — weeks across the turn of 2026 (ISO week 53) and 29 February 2028", () => {
  // Monday 28 December 2026 starts ISO week 2026-W53, which ends on Sunday 3 January 2027.
  it("keeps New Year's night in the week of Monday 28 December", () => {
    // 1 January 2027, 0:30 in Paris: the evening of 31 December.
    expect(weekStartOf(eveningOf("2026-12-31T23:30:00.000Z"))).toBe(
      "2026-12-28",
    );
    expect(weekStartOf(eveningOf("2027-01-03T22:59:00.000Z"))).toBe(
      "2026-12-28",
    );
    expect(weekStartOf(eveningOf("2027-01-04T03:59:00.000Z"))).toBe(
      "2026-12-28",
    );
    expect(weekStartOf(eveningOf("2027-01-04T04:00:00.000Z"))).toBe(
      "2027-01-04",
    );
  });

  it("keeps 29 February 2028 in the week of Monday 28 February", () => {
    expect(weekStartOf(eveningOf("2028-02-29T19:00:00.000Z"))).toBe(
      "2028-02-28",
    );
    // 1 March 2028, 0:30 in Paris: the evening of 29 February.
    expect(weekStartOf(eveningOf("2028-02-29T23:30:00.000Z"))).toBe(
      "2028-02-28",
    );
    expect(weekStartOf(eveningOf("2028-03-06T03:59:00.000Z"))).toBe(
      "2028-02-28",
    );
    expect(weekStartOf(eveningOf("2028-03-06T04:00:00.000Z"))).toBe(
      "2028-03-06",
    );
  });
});

describe("RG-20 — the first and last evening dates", () => {
  it("puts 1969-12-31, the first evening date, in the week of Monday 1969-12-29", () => {
    expect(weekStartOf(eveningOf("1970-01-01T00:00:00.000Z"))).toBe(
      "1969-12-29",
    );
  });

  it("puts 9999-12-31, the last evening date (UTC + 14 h), in the week of Monday 9999-12-27", () => {
    const kiritimati = DateTime.zoneMakeNamedUnsafe("Pacific/Kiritimati");
    const last = eveningOf("9999-12-30T23:00:00.000Z", kiritimati);
    expect(last).toBe("9999-12-31");
    expect(weekStartOf(last)).toBe("9999-12-27");
    expect(fortnightIndexOf(last)).toBe(209_492);
  });
});

describe("RG-20 — week start, the input and the result", () => {
  it("takes an evening date, never a plain string or an instant (refused at compile time)", () => {
    expectTypeOf(weekStartOf).parameter(0).toEqualTypeOf<EveningDate>();
    expectTypeOf(fortnightIndexOf).parameter(0).toEqualTypeOf<EveningDate>();
  });

  it("gives a week start that is an evening date, and not every evening date is a week start", () => {
    expectTypeOf<WeekStart>().toExtend<EveningDate>();
    expectTypeOf<EveningDate>().not.toExtend<WeekStart>();
  });
});

// Fortnight index (RG-22): number of whole fortnights between Monday 1969-12-29, the Monday of the
// week of the earliest evening date, and the evening. Python:
// `(date - date(1969, 12, 29)).days // 14`.
describe("RG-22 — fortnight index, counted from Monday 1969-12-29", () => {
  it("numbers the first fortnight 0, from the first evening date, and the next one 1", () => {
    expect(fortnightIndexOf(eveningOf("1970-01-01T00:00:00.000Z"))).toBe(0);
    expect(fortnightIndexOf(eveningOfDay(daysOfIsoText("1970-01-11")))).toBe(0);
    expect(fortnightIndexOf(eveningOfDay(daysOfIsoText("1970-01-12")))).toBe(1);
  });

  it("puts the 2026 week 53 and the 2027 week 1 in the same fortnight", () => {
    // Both ISO weeks are odd: a parity of ISO week numbers would give them the same holder.
    expect(fortnightIndexOf(eveningOf("2026-12-27T12:00:00.000Z"))).toBe(1486);
    expect(fortnightIndexOf(eveningOf("2026-12-28T12:00:00.000Z"))).toBe(1487);
    expect(fortnightIndexOf(eveningOf("2027-01-03T12:00:00.000Z"))).toBe(1487);
    expect(fortnightIndexOf(eveningOf("2027-01-04T12:00:00.000Z"))).toBe(1487);
    expect(fortnightIndexOf(eveningOf("2027-01-10T12:00:00.000Z"))).toBe(1487);
    expect(fortnightIndexOf(eveningOf("2027-01-11T12:00:00.000Z"))).toBe(1488);
  });

  it("changes fortnight on Monday at 5:00, not at midnight", () => {
    expect(fortnightIndexOf(eveningOf("2026-12-28T03:59:00.000Z"))).toBe(1486);
    expect(fortnightIndexOf(eveningOf("2026-12-28T04:00:00.000Z"))).toBe(1487);
    expect(fortnightIndexOf(eveningOf("2027-01-11T03:59:00.000Z"))).toBe(1487);
    expect(fortnightIndexOf(eveningOf("2027-01-11T04:00:00.000Z"))).toBe(1488);
  });

  it("counts across 29 February 2028", () => {
    expect(fortnightIndexOf(eveningOf("2028-02-29T19:00:00.000Z"))).toBe(1517);
    expect(fortnightIndexOf(eveningOf("2028-03-06T04:00:00.000Z"))).toBe(1518);
  });
});

// Properties over every evening date that zone UTC reaches (1969-12-31 to 9999-12-30: 8 030 years,
// leap years and 53-week years included). Explicit generators; default `numRuns`.
const anyDay = fc.integer({ min: FIRST_DAY, max: LAST_DAY });

describe("RG-20 — week start, properties", () => {
  it("is a Monday, at most 6 days before the evening", () => {
    fc.assert(
      fc.property(anyDay, (days) => {
        const start = weekStartDay(days);
        expect(weekdayOf(start)).toBe(0);
        expect(days - start).toBeGreaterThanOrEqual(0);
        expect(days - start).toBeLessThanOrEqual(6);
      }),
    );
  });

  it("is the same for the seven evenings of a week", () => {
    const lastMonday = Math.floor((LAST_DAY - 6 - ANCHOR) / 7);
    fc.assert(
      fc.property(fc.integer({ min: 1, max: lastMonday }), (week) => {
        const monday = ANCHOR + 7 * week;
        const starts = Array.from({ length: 7 }, (_, offset) =>
          weekStartOf(eveningOfDay(monday + offset)),
        );
        expect(starts).toEqual(
          Array.from({ length: 7 }, () => isoTextOf(monday)),
        );
      }),
    );
  });
  // "Two consecutive weeks start 7 days apart" follows from the first property (the Monday at most
  // 6 days before an evening is unique): as a random property it killed no mutant, so the sweep
  // below checks it on every Monday from 1970 to 2100 instead.
});

describe("RG-22 — fortnight index, properties", () => {
  it("is constant over the 14 evenings of a fortnight aligned on the anchor, then grows by exactly 1", () => {
    const lastFortnight = Math.floor((LAST_DAY - 14 - ANCHOR) / 14);
    fc.assert(
      fc.property(fc.integer({ min: 1, max: lastFortnight }), (fortnight) => {
        const first = ANCHOR + 14 * fortnight;
        const indexes = Array.from({ length: 14 }, (_, offset) =>
          fortnightOfDay(first + offset),
        );
        expect(indexes).toEqual(Array.from({ length: 14 }, () => fortnight));
        expect(fortnightOfDay(first - 1)).toBe(fortnight - 1);
        expect(fortnightOfDay(first + 14)).toBe(fortnight + 1);
      }),
    );
  });
});

// Exhaustive sweep, every evening from 1969-12-31 to 2100-12-31: a random property can miss a
// defect confined to a few days a year (J2.2), such as a week numbering that breaks at the end of a
// 53-week year (1970, 1976, … 2026, 2032, … 2099) or on 29 February (2000 is a leap year, 2100 is
// not). Each evening's week start and fortnight index are checked against the oracle, and each
// new week against the previous one: exactly 7 days later.
describe("RG-20, RG-22 — every evening from 1969-12-31 to 2100-12-31", () => {
  it("starts each week on Monday, 7 days after the previous one, and each fortnight every other Monday from the anchor", () => {
    const last = daysFromCivil({ year: 2100, month: 12, day: 31 });
    const wrong: string[] = [];
    let wrongCount = 0;
    let start = weekStartDay(FIRST_DAY);
    let fortnight = fortnightOfDay(FIRST_DAY);
    for (let days = FIRST_DAY + 1; days <= last; days += 1) {
      const date = eveningOfDay(days);
      const monday = weekdayOf(days) === 0;
      const expectedStart = monday ? days : start;
      const expectedFortnight =
        (days - ANCHOR) % 14 === 0 ? fortnight + 1 : fortnight;
      const previousStart = start;
      start = daysOfIsoText(weekStartOf(date));
      fortnight = fortnightIndexOf(date);
      const step = start - previousStart;
      if (
        start !== expectedStart ||
        step !== (monday ? 7 : 0) ||
        fortnight !== expectedFortnight
      ) {
        wrongCount += 1;
        if (wrong.length < 5)
          wrong.push(`${date}: ${isoTextOf(start)}, ${fortnight}`);
      }
    }
    expect({ wrongCount, wrong }).toEqual({ wrongCount: 0, wrong: [] });
    expect(weekStartDay(FIRST_DAY)).toBe(ANCHOR);
    expect(fortnightOfDay(FIRST_DAY)).toBe(0);
  });
});
