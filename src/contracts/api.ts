import { Schema } from "effect";
import { HttpApi, HttpApiEndpoint, HttpApiGroup } from "effect/http-api";

// Branded so that a plain object, which fails encoding at runtime, is refused at compile time.
export class Health extends Schema.Class<
  Health,
  { readonly brand: unique symbol }
>("Health")({
  status: Schema.Literal("ok"),
  version: Schema.NonEmptyString,
}) {}

// Technical routes that belong to none of the contexts of technique-v2 §6.1.
const system = HttpApiGroup.make("system").add(
  HttpApiEndpoint.get("health", "/health", { success: Health }),
);

// `prefix` only applies to the groups already added: add every group before it.
export const Api = HttpApi.make("DeuxPlaces").add(system).prefix("/api/v1");
