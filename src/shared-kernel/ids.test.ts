import { describe, expect, it } from "vitest";
import { HouseholdId, MemberId, ReserveItemId } from "./ids";

// Plan J2.1; technique-v2 §5.1 (branded identifiers, `Brand.nominal`); CONTEXT.md (Household,
// Member, ReserveItem). The type assertions are checked by `tsc --noEmit` (pnpm check).

const text = "0194d8b2-7a3c-7def-8123-456789abcdef";

describe("Branded identifiers (technique-v2 §5.1)", () => {
  it("keep their text unchanged and stay usable as text", () => {
    const household: string = HouseholdId(text);
    expect([household, MemberId(text), ReserveItemId(text)]).toEqual([
      text,
      text,
      text,
    ]);
  });

  it("cannot stand for one another, nor come from plain text without their constructor", () => {
    const member = MemberId(text);
    const household = HouseholdId(text);
    const item = ReserveItemId(text);
    // @ts-expect-error a member's identifier is not a household's
    const asHousehold: HouseholdId = member;
    // @ts-expect-error a household's identifier is not a reserve item's
    const asItem: ReserveItemId = household;
    // @ts-expect-error a reserve item's identifier is not a member's
    const asMember: MemberId = item;
    // @ts-expect-error plain text is not an identifier
    const fromText: HouseholdId = text;
    expect([asHousehold, asItem, asMember, fromText]).toHaveLength(4);
  });
});
