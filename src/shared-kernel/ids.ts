import { Brand } from "effect";

// Identifiers of the household's aggregates (technique-v2 §5.1; names from CONTEXT.md). Their text
// is a UUIDv7 generated on the server side (`uuid-v7.ts`), sortable by date.

export type HouseholdId = string & Brand.Brand<"HouseholdId">;
export const HouseholdId = Brand.nominal<HouseholdId>();
export type MemberId = string & Brand.Brand<"MemberId">;
export const MemberId = Brand.nominal<MemberId>();
export type ReserveItemId = string & Brand.Brand<"ReserveItemId">;
export const ReserveItemId = Brand.nominal<ReserveItemId>();
