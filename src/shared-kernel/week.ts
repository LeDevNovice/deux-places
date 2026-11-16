import { Brand, DateTime } from "effect";
import type { EveningDate } from "./evening-date";

// Week (RG-20 "lundi à dimanche"; CONTEXT.md `WeekPlan` "Lundi → dimanche"): the week of an
// evening is identified by the evening date of its Monday, as `week_plan.week_start (lundi)` and
// `/weeks/{weekStart}` (produit.md), in ISO text `YYYY-MM-DD` (technique-v2 §7.1). Pure calendar
// arithmetic in UTC on the evening date: the 5 a.m. cutoff and the household's time zone are
// already in the `EveningDate` (J2.2), so Monday 4:59 belongs to the previous week.

export type WeekStart = EveningDate & Brand.Brand<"WeekStart">;
const WeekStart = Brand.nominal<WeekStart>();

const MONDAY = 1; // `weekStartsOn`: 0 = Sunday

const midnightOf = (date: EveningDate) => {
  const [year = 0, month = 0, day = 0] = date.split("-").map(Number);
  return DateTime.makeUnsafe({ year, month, day });
};

export const weekStartOf = (date: EveningDate): WeekStart =>
  WeekStart(
    DateTime.formatIsoDateUtc(
      DateTime.startOf(midnightOf(date), "week", { weekStartsOn: MONDAY }),
    ),
  );

// Fortnight index (RG-22 "une carte blanche par quinzaine", in alternation): the number of whole
// fortnights from a fixed Monday to the evening. The anchor is the Monday of the week of the
// earliest evening date (1969-12-31, J2.2), so every index is a natural number. It is calendar
// only: it says nothing about which member holds a carte blanche (J8.6).
const FORTNIGHT = 14 * 24 * 3_600_000;
const ANCHOR = DateTime.toEpochMillis(
  DateTime.makeUnsafe({ year: 1969, month: 12, day: 29 }),
);

export const fortnightIndexOf = (date: EveningDate): number =>
  Math.floor((DateTime.toEpochMillis(midnightOf(date)) - ANCHOR) / FORTNIGHT);
