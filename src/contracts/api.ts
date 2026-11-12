import { Schema } from "effect";
import {
  HttpApi,
  HttpApiEndpoint,
  HttpApiError,
  HttpApiGroup,
  HttpApiMiddleware,
} from "effect/http-api";

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

/** technique-v2 §6.2: an input the server refuses to decode or to accept. */
export class Validation extends HttpApiError.Problem<Validation>()(
  "Validation",
  { type: "/problems/validation", status: 400, title: "Bad Request" },
) {}

/** Turns a request the contract cannot decode into the `validation` problem of §6.2. */
export class ValidationProblems extends HttpApiMiddleware.Service<ValidationProblems>()(
  "ValidationProblems",
  { error: Validation },
) {}

/**
 * The application server's VAPID public key (RFC 8292 §3.2), which the PWA gives the browser as
 * `applicationServerKey` (W3C Push API): an uncompressed P-256 point in base64url.
 */
export class PushPublicKey extends Schema.Class<
  PushPublicKey,
  { readonly brand: unique symbol }
>("PushPublicKey")({
  publicKey: Schema.NonEmptyString,
}) {}

/**
 * A phone's push subscription as the browser gives it (W3C Push API `PushSubscription.toJSON()`):
 * the push resource URL (RFC 8030) and the keys of RFC 8291 in base64url. `expirationTime` is
 * not kept. The server checks the URL and the keys, and refuses them with `Validation`.
 */
export const PushSubscriptionInput = Schema.Struct({
  endpoint: Schema.String,
  keys: Schema.Struct({ p256dh: Schema.String, auth: Schema.String }),
});

// The household's push notifications (technique-v2 §6.1 group `notifications`; produit.md §7
// names `POST /push/subscriptions`). Until J3.6 they reach the development household, without a
// session.
const notifications = HttpApiGroup.make("notifications")
  .add(
    HttpApiEndpoint.get("publicKey", "/push/public-key", {
      success: PushPublicKey,
    }),
  )
  .add(
    HttpApiEndpoint.post("subscribe", "/push/subscriptions", {
      payload: PushSubscriptionInput,
      error: Validation,
    }).middleware(ValidationProblems),
  )
  // The development page « Tester une notification dans 1 min » (plan J1.14).
  .add(HttpApiEndpoint.post("testNotification", "/push/test-notification"));

// `prefix` only applies to the groups already added: add every group before it.
export const Api = HttpApi.make("DeuxPlaces")
  .add(system)
  .add(notifications)
  .prefix("/api/v1");
