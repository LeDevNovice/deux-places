import { Exit, Schema } from "effect";
import { describe, expect, it } from "vitest";
import { LiveMessage } from "./live";

// Plan J2.4; technique-v2 §6.3 (each live message carries its sequence number; minimal payload)
// and the replay decision recorded in PROGRESS (J2.4): an event, or "resync" when the household
// cannot replay what the phone missed. Expectations come from that text, not from the code.
const decode = Schema.decodeUnknownExit(LiveMessage);

describe("Live messages (technique-v2 §6.3)", () => {
  it("reads an event with its sequence number, its kind and its JSON payload", () => {
    const message = {
      type: "event",
      sequence: 12,
      kind: "swap.vote_cast",
      payload: { candidate: 2 },
    };
    expect(decode(message)).toStrictEqual(Exit.succeed(message));
  });

  it("reads a resync with the sequence number the phone resumes after, 0 for a household without events", () => {
    for (const sequence of [0, 41])
      expect(decode({ type: "resync", sequence })).toStrictEqual(
        Exit.succeed({ type: "resync", sequence }),
      );
  });

  it.each([
    [
      "an event numbered 0",
      { type: "event", sequence: 0, kind: "a.b", payload: null },
    ],
    [
      "a fractional number",
      { type: "event", sequence: 1.5, kind: "a.b", payload: null },
    ],
    ["an event without a payload", { type: "event", sequence: 1, kind: "a.b" }],
    ["a negative resync", { type: "resync", sequence: -1 }],
    ["an unknown type", { type: "hello", sequence: 1 }],
  ])("refuses %s", (_case, message) => {
    expect(Exit.isFailure(decode(message))).toBe(true);
  });
});
