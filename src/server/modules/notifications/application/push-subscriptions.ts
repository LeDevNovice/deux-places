import { Context, Data, Effect, Result } from "effect";
import { Base64Url } from "effect/encoding";
import { isP256PublicKey } from "./p256";
import type { PushSubscription } from "./push-sender";

/** The household's push subscriptions, one per endpoint (technique-v2 §7.1). */
export class PushSubscriptions extends Context.Service<
  PushSubscriptions,
  {
    /** Stores the subscription; an endpoint already known gets the new keys. */
    readonly save: (subscription: PushSubscription) => Effect.Effect<void>;
    readonly list: Effect.Effect<ReadonlyArray<PushSubscription>>;
    readonly remove: (endpoint: string) => Effect.Effect<void>;
  }
>()("PushSubscriptions") {}

/** The application server's VAPID public key, which phones subscribe with (RFC 8292 §3.2). */
export class ApplicationServerKey extends Context.Service<
  ApplicationServerKey,
  { readonly publicKey: string }
>()("ApplicationServerKey") {}

/** A subscription no message could ever reach. The reason never contains a key. */
export class PushSubscriptionRefused extends Data.TaggedError(
  "PushSubscriptionRefused",
)<{ readonly reason: string }> {}

const octets = (value: string) =>
  Result.getOrUndefined(Base64Url.decode(value));

// RFC 8030 §5: the push resource is an https: URL. RFC 8291 §3.1, §3.2: p256dh is an uncompressed
// P-256 point and auth 16 octets, both in base64url. Checked here so that a phone learns at once
// that its subscription is unusable, instead of a message failing later.
const refusal = (subscription: PushSubscription) => {
  const { endpoint, keys } = subscription;
  if (!URL.canParse(endpoint) || new URL(endpoint).protocol !== "https:")
    return "the endpoint is not an https: URL";
  const p256dh = octets(keys.p256dh);
  if (p256dh === undefined || !isP256PublicKey(p256dh))
    return "p256dh is not an uncompressed P-256 point in base64url";
  if (octets(keys.auth)?.length !== 16)
    return "auth is not 16 octets in base64url";
  return undefined;
};

/** Keeps the phone's subscription, so that the household's messages reach it. */
export const registerPushSubscription = Effect.fn("RegisterPushSubscription")(
  function* (subscription: PushSubscription) {
    const reason = refusal(subscription);
    if (reason !== undefined)
      return yield* new PushSubscriptionRefused({ reason });
    const subscriptions = yield* PushSubscriptions;
    return yield* subscriptions.save(subscription);
  },
);
