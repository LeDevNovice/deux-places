import { DateTime } from "effect";

// French legal time written from its rules, independently of any time-zone database:
// - standard time is UTC + 1 h (décret n° 2017-292 du 6 mars 2017 relatif à l'heure légale
//   française);
// - summer time puts clocks forward by 60 minutes (directive 2000/84/EC, art. 1), from 1.00 a.m.
//   GMT on the last Sunday in March (art. 2) to 1.00 a.m. GMT on the last Sunday in October
//   (art. 3), every year from 2002 onwards.
// Used as the oracle of the evening-date tests (plan J2.2): expectations come from these rules,
// never from the code under test. Valid for instants of years 2002 and later.

export const HOUR = 3_600_000;
export const DAY = 24 * HOUR;
export const FIRST_RULE_YEAR = 2002; // directive 2000/84/EC, art. 2 and 3: "From 2002 onwards"

const utcInstant = (year: number, month: number, day: number, hour = 0) =>
  DateTime.toEpochMillis(DateTime.makeUnsafe({ year, month, day, hour }));

const utcParts = (instant: number) =>
  DateTime.toPartsUtc(DateTime.makeUnsafe(instant));

/** Day of the month of the last Sunday of March or October (both have 31 days). */
export const lastSundayOf = (year: number, month: 3 | 10): number =>
  31 - utcParts(utcInstant(year, month, 31)).weekDay; // weekDay: 0 = Sunday

/** 1.00 a.m. GMT on the last Sunday in March (art. 2). */
export const summerTimeStart = (year: number): number =>
  utcInstant(year, 3, lastSundayOf(year, 3), 1);

/** 1.00 a.m. GMT on the last Sunday in October (art. 3). */
export const summerTimeEnd = (year: number): number =>
  utcInstant(year, 10, lastSundayOf(year, 10), 1);

/** UTC offset of French legal time at an instant: +2 h in summer time, +1 h otherwise. */
export const parisOffset = (instant: number): number => {
  const { year } = utcParts(instant);
  return instant >= summerTimeStart(year) && instant < summerTimeEnd(year)
    ? 2 * HOUR
    : HOUR;
};

const pad = (value: number, width: number) =>
  String(value).padStart(width, "0");

/** ISO calendar date `YYYY-MM-DD` of a UTC instant. */
export const isoDate = (instant: number): string => {
  const { year, month, day } = utcParts(instant);
  return `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}`;
};

/** UTC midnight of an ISO calendar date. */
const midnightOf = (date: string): number => {
  const [year = 0, month = 0, day = 0] = date.split("-").map(Number);
  return utcInstant(year, month, day);
};

/** The calendar date after `date`. */
export const nextDate = (date: string): string =>
  isoDate(midnightOf(date) + DAY);

/**
 * The instant at which the evening of `date` starts: 5:00 French legal time on that date
 * (CONTEXT.md: "Coupure à 5 h, fuseau du foyer"). 5:00 is never skipped nor repeated in France,
 * whose clocks change between 2:00 and 3:00 local time, so exactly one offset fits.
 */
export const eveningStart = (date: string): number => {
  const wallClock = midnightOf(date) + 5 * HOUR;
  const inStandardTime = wallClock - HOUR;
  return parisOffset(inStandardTime) === HOUR
    ? inStandardTime
    : wallClock - 2 * HOUR;
};

/** The evening date an instant belongs to, from the rules above. */
export const ruleEveningDate = (instant: number): string =>
  isoDate(instant + parisOffset(instant) - 5 * HOUR);

/** French legal wall-clock time of an instant, as UTC parts. */
export const parisWallClock = (instant: number) =>
  utcParts(instant + parisOffset(instant));

/** The calendar date before `date`. */
export const previousDate = (date: string): string =>
  isoDate(midnightOf(date) - DAY);

const aroundChange = (instant: number) => [instant - 1, instant] as const;

export interface BoundaryCase {
  readonly what: string;
  readonly instant: number;
  readonly expected: string;
}

/**
 * Instants at the edges of the two evenings that contain a clock change in `year`: the evening
 * before the last Sunday in March lasts 23 hours (5:00 standard time to 5:00 summer time), the one
 * before the last Sunday in October 25 hours. Expected dates come from the calendar of those
 * Sundays, never from the code under test.
 */
export const clockChangeCases = (year: number): readonly BoundaryCase[] => {
  const springSunday = `${year}-03-${pad(lastSundayOf(year, 3), 2)}`;
  const autumnSunday = `${year}-10-${pad(lastSundayOf(year, 10), 2)}`;
  const spring = previousDate(springSunday);
  const autumn = previousDate(autumnSunday);
  const springStart = midnightOf(spring) + 4 * HOUR; // 5:00 at UTC + 1 h
  const springEnd = springStart + 23 * HOUR; // 5:00 at UTC + 2 h, next day
  const autumnStart = midnightOf(autumn) + 3 * HOUR; // 5:00 at UTC + 2 h
  const autumnEnd = autumnStart + 25 * HOUR; // 5:00 at UTC + 1 h, next day
  return [
    {
      what: "before the 23-hour evening",
      instant: springStart - 1,
      expected: previousDate(spring),
    },
    {
      what: "start of the 23-hour evening",
      instant: springStart,
      expected: spring,
    },
    ...aroundChange(summerTimeStart(year)).map((instant) => ({
      what: "clocks go forward",
      instant,
      expected: spring,
    })),
    {
      what: "end of the 23-hour evening",
      instant: springEnd - 1,
      expected: spring,
    },
    {
      what: "after the 23-hour evening",
      instant: springEnd,
      expected: springSunday,
    },
    {
      what: "before the 25-hour evening",
      instant: autumnStart - 1,
      expected: previousDate(autumn),
    },
    {
      what: "start of the 25-hour evening",
      instant: autumnStart,
      expected: autumn,
    },
    ...aroundChange(summerTimeEnd(year)).map((instant) => ({
      what: "clocks go back",
      instant,
      expected: autumn,
    })),
    {
      what: "first 2:30, summer time",
      instant: summerTimeEnd(year) - HOUR / 2,
      expected: autumn,
    },
    {
      what: "second 2:30, standard time",
      instant: summerTimeEnd(year) + HOUR / 2,
      expected: autumn,
    },
    { what: "4:00 standard time", instant: autumnEnd - HOUR, expected: autumn },
    {
      what: "end of the 25-hour evening",
      instant: autumnEnd - 1,
      expected: autumn,
    },
    {
      what: "after the 25-hour evening",
      instant: autumnEnd,
      expected: autumnSunday,
    },
  ];
};

const MINUTE = 60_000;

/** Every minute from 3 hours before to 3 hours after each clock change of `year`. */
export const clockChangeNights = (
  year: number,
): readonly (readonly number[])[] =>
  [summerTimeStart(year), summerTimeEnd(year)].map((change) =>
    Array.from(
      { length: (6 * HOUR) / MINUTE + 1 },
      (_, index) => change - 3 * HOUR + index * MINUTE,
    ),
  );
