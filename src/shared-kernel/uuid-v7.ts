import { Data, Result } from "effect";

/** What the previous identifier of a sequence used: its timestamp and its counter. */
export interface UuidV7Sequence {
  readonly unixMs: number;
  readonly counter: number;
}

export class UuidV7InstantOutOfRange extends Data.TaggedError(
  "UuidV7InstantOutOfRange",
)<{ readonly unixMs: number }> {}

const toText = (octets: Uint8Array): string => {
  const hex = Array.from(octets, (octet) =>
    octet.toString(16).padStart(2, "0"),
  ).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

const MAX_COUNTER = 0xfff; // rand_a, 12 bits
const MAX_UNIX_MS = 2 ** 48 - 1; // unix_ts_ms, 48 bits
export const RANDOM_OCTETS = 10; // 11 counter-seed bits + 62 rand_b bits, rounded up

const inRange = (unixMs: number) =>
  Number.isInteger(unixMs) && unixMs >= 0 && unixMs <= MAX_UNIX_MS;

const stamp = (
  previous: UuidV7Sequence | undefined,
  unixMs: number,
  seed: number,
): UuidV7Sequence => {
  if (previous === undefined || unixMs > previous.unixMs) {
    return { unixMs, counter: seed };
  }
  if (previous.counter < MAX_COUNTER) {
    return { unixMs: previous.unixMs, counter: previous.counter + 1 };
  }
  return { unixMs: previous.unixMs + 1, counter: seed };
};

export const nextUuidV7 = (
  previous: UuidV7Sequence | undefined,
  now: number,
  random: Uint8Array,
): Result.Result<
  { readonly id: string; readonly sequence: UuidV7Sequence },
  UuidV7InstantOutOfRange
> => {
  if (random.length !== RANDOM_OCTETS) {
    throw new RangeError(
      `UUIDv7 needs ${RANDOM_OCTETS} random octets, got ${random.length}`,
    );
  }
  if (!inRange(now))
    return Result.fail(new UuidV7InstantOutOfRange({ unixMs: now }));
  const bits = new DataView(
    random.buffer,
    random.byteOffset,
    random.byteLength,
  );
  const { unixMs, counter } = stamp(previous, now, bits.getUint16(0) & 0x7ff);
  if (!inRange(unixMs))
    return Result.fail(new UuidV7InstantOutOfRange({ unixMs }));
  const uuid = new DataView(new ArrayBuffer(16));
  uuid.setUint16(0, Math.floor(unixMs / 2 ** 32));
  uuid.setUint32(2, unixMs % 2 ** 32);
  uuid.setUint16(6, 0x7000 | counter);
  uuid.setUint8(8, 0x80 | (bits.getUint8(2) & 0x3f));
  for (let octet = 9; octet < 16; octet++) {
    uuid.setUint8(octet, bits.getUint8(octet - 6));
  }
  return Result.succeed({
    id: toText(new Uint8Array(uuid.buffer)),
    sequence: { unixMs, counter },
  });
};
