// The proleptic Gregorian calendar in whole days, written with integer arithmetic only, without
// `Date` nor `effect`: Howard Hinnant, "chrono-Compatible Low-Level Date Algorithms",
// `days_from_civil` and `civil_from_days` (http://howardhinnant.github.io/date_algorithms.html).
// Oracle of the week tests (plan J2.3): weekdays and day counts come from here, never from the
// code under test. Day 0 is Thursday 1970-01-01.

export interface CivilDate {
  readonly year: number;
  readonly month: number;
  readonly day: number;
}

/** Days from 1970-01-01 to a calendar date. */
export const daysFromCivil = ({ year, month, day }: CivilDate): number => {
  const y = month <= 2 ? year - 1 : year;
  const era = Math.floor(y / 400);
  const yearOfEra = y - era * 400;
  const dayOfYear =
    Math.floor((153 * (month > 2 ? month - 3 : month + 9) + 2) / 5) + day - 1;
  const dayOfEra =
    yearOfEra * 365 +
    Math.floor(yearOfEra / 4) -
    Math.floor(yearOfEra / 100) +
    dayOfYear;
  return era * 146_097 + dayOfEra - 719_468;
};

/** Calendar date of a day counted from 1970-01-01. */
export const civilFromDays = (days: number): CivilDate => {
  const z = days + 719_468;
  const era = Math.floor(z / 146_097);
  const dayOfEra = z - era * 146_097;
  const yearOfEra = Math.floor(
    (dayOfEra -
      Math.floor(dayOfEra / 1460) +
      Math.floor(dayOfEra / 36_524) -
      Math.floor(dayOfEra / 146_096)) /
      365,
  );
  const dayOfYear =
    dayOfEra -
    (365 * yearOfEra + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100));
  const shiftedMonth = Math.floor((5 * dayOfYear + 2) / 153);
  const day = dayOfYear - Math.floor((153 * shiftedMonth + 2) / 5) + 1;
  const month = shiftedMonth < 10 ? shiftedMonth + 3 : shiftedMonth - 9;
  return { year: yearOfEra + era * 400 + (month <= 2 ? 1 : 0), month, day };
};

/** 0 = Monday … 6 = Sunday (1970-01-01, day 0, is a Thursday). */
export const weekdayOf = (days: number): number => (((days + 3) % 7) + 7) % 7;

const pad = (value: number, width: number) =>
  String(value).padStart(width, "0");

/** ISO text `YYYY-MM-DD` of a day counted from 1970-01-01. */
export const isoTextOf = (days: number): string => {
  const { year, month, day } = civilFromDays(days);
  return `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}`;
};

/** Day counted from 1970-01-01 of an ISO text `YYYY-MM-DD`. */
export const daysOfIsoText = (text: string): number => {
  const [year = 0, month = 0, day = 0] = text.split("-").map(Number);
  return daysFromCivil({ year, month, day });
};
