import { Brand, Data, DateTime, Result } from "effect";

// Evening date (technique-v2 §5.1; CONTEXT.md `EveningDate`: "Coupure à 5 h, fuseau du foyer"):
// the evening an instant belongs to is the calendar date of the household's wall-clock time minus
// 5 hours, so a showing launched at 0:40 belongs to the previous evening. Text `YYYY-MM-DD`, as
// stored (§7.1). Pure: the instant is given (UTC milliseconds, §7.1), never read from a clock.
// The zone is built once by the caller (`DateTime.zoneMakeNamed`, one `Intl.DateTimeFormat`),
// not here on every call; each call formats the instant once with it.

export type EveningDate = string & Brand.Brand<"EveningDate">;
const EveningDate = Brand.nominal<EveningDate>();

export class EveningInstantOutOfRange extends Data.TaggedError(
  "EveningInstantOutOfRange",
)<{ readonly instant: number }> {}

const CUTOFF = 5 * 3_600_000;
// 9999-12-31T00:00:00.000Z, excluded: the last day of year 9999 is left aside so that the evening
// date keeps four year digits in every IANA zone (offsets from -12 h to +14 h).
const END_OF_RANGE = 253_402_214_400_000;

const inRange = (instant: number) =>
  Number.isInteger(instant) && instant >= 0 && instant < END_OF_RANGE;

const pad = (value: number, width: number) =>
  String(value).padStart(width, "0");

export const eveningDateOf = (
  instant: number,
  zone: DateTime.TimeZone.Named,
): Result.Result<EveningDate, EveningInstantOutOfRange> => {
  if (!inRange(instant))
    return Result.fail(new EveningInstantOutOfRange({ instant }));
  const offset = DateTime.zonedOffset(
    DateTime.makeZonedUnsafe(instant, { timeZone: zone }),
  );
  const { year, month, day } = DateTime.toPartsUtc(
    DateTime.makeUnsafe(instant + offset - CUTOFF),
  );
  return Result.succeed(
    EveningDate(`${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}`),
  );
};
