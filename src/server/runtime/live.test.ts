import { describe, expect, it } from "vitest";
import { maxReplay, replayOf, sinceOf, type StoredEvent } from "./live";

// Plan J2.4; technique-v2 §6.3 (« Reprise » : the phone sends the last number it received,
// `/api/v1/live?since=…`) and §6.2 (an input the server refuses). A sequence number is a positive
// integer (SQLite INTEGER PRIMARY KEY), 0 for a phone that has received nothing yet.
const at = (query: string) =>
  new URL(`https://deux-places.test/api/v1/live${query}`);

describe("live — the `since` of a reconnection (technique-v2 §6.3)", () => {
  it("is absent when the phone sends none", () => {
    expect(sinceOf(at(""))).toBe("absent");
    expect(sinceOf(at("?other=1"))).toBe("absent");
  });

  it("reads 0 and any positive integer written in decimal digits", () => {
    expect(sinceOf(at("?since=0"))).toBe(0);
    expect(sinceOf(at("?since=1"))).toBe(1);
    expect(sinceOf(at("?since=41"))).toBe(41);
    expect(sinceOf(at("?since=9007199254740991"))).toBe(
      Number.MAX_SAFE_INTEGER,
    );
  });

  it.each([
    ["empty", "?since="],
    ["negative", "?since=-1"],
    ["negative zero", "?since=-0"],
    ["a fraction", "?since=1.5"],
    ["not a number", "?since=abc"],
    ["an exponent", "?since=1e3"],
    ["a sign", "?since=%2B1"],
    ["leading zeros", "?since=007"],
    ["spaces", "?since=%201"],
    ["hexadecimal", "?since=0x10"],
    ["beyond the integers a number holds exactly", "?since=9007199254740992"],
    ["very large", "?since=99999999999999999999999"],
    ["given twice", "?since=1&since=2"],
  ])("refuses %s", (_case, query) => {
    expect(sinceOf(at(query))).toBe("refused");
  });
});

// Rows as the household reads them for a replay: every event from `since` (or from 1), ascending.
const stored = (
  sequence: number,
  audience: StoredEvent["audience"] = "household",
): StoredEvent => ({
  sequence,
  kind: "test.happened",
  audience,
  payload: `{"n":${sequence}}`,
});
const range = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, index) => stored(from + index));
const event = (sequence: number) => ({
  type: "event",
  sequence,
  kind: "test.happened",
  payload: { n: sequence },
});
const resync = (sequence: number) => ({ type: "resync", sequence });

describe("live — what a reconnection replays (technique-v2 §6.3; decision of J2.4)", () => {
  it("sends the household's events numbered after `since`, in increasing order, never `since` itself", () => {
    expect(replayOf(3, 6, range(3, 6))).toStrictEqual([
      event(4),
      event(5),
      event(6),
    ]);
  });

  it("sends every event to a phone that has received none (`since` 0)", () => {
    expect(replayOf(0, 2, range(1, 2))).toStrictEqual([event(1), event(2)]);
  });

  it("sends nothing to a phone that is up to date, nor for a household without events", () => {
    expect(replayOf(6, 6, range(6, 6))).toStrictEqual([]);
    expect(replayOf(0, 0, [])).toStrictEqual([]);
  });

  it("never sends an internal event, and still sends the household's events after it", () => {
    const rows = [stored(3), stored(4, "internal"), stored(5)];
    expect(replayOf(3, 5, rows)).toStrictEqual([event(5)]);
  });

  it("replays up to the bound, and asks for a resync beyond it", () => {
    expect(replayOf(1, 1 + maxReplay, range(1, 1 + maxReplay))).toHaveLength(
      maxReplay,
    );
    expect(replayOf(1, 2 + maxReplay, range(1, 2 + maxReplay))).toStrictEqual([
      resync(2 + maxReplay),
    ]);
  });

  it("asks for a resync when the phone's number was never given by this database (restored to an earlier point)", () => {
    expect(replayOf(9, 6, [])).toStrictEqual([resync(6)]);
    expect(replayOf(1, 0, [])).toStrictEqual([resync(0)]);
  });

  it("asks for a resync when an event the phone needs, or the one it last received, is no longer there", () => {
    expect(replayOf(3, 6, [stored(3), stored(4), stored(6)])).toStrictEqual([
      resync(6),
    ]);
    expect(replayOf(3, 6, range(4, 6))).toStrictEqual([resync(6)]);
    expect(replayOf(3, 6, range(3, 5))).toStrictEqual([resync(6)]);
    expect(replayOf(0, 3, range(2, 3))).toStrictEqual([resync(3)]);
  });
});
