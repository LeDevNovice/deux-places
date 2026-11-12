import { Context, Data, type Duration, type Effect, type Option } from "effect";

/**
 * Where and how to reach one phone (W3C Push API, `PushSubscription.toJSON()`): the push resource
 * URL of RFC 8030, and the phone's ECDH public key and authentication secret of RFC 8291, both in
 * base64url. Not to be confused with a household `Subscription` to a streaming service.
 */
export interface PushSubscription {
  readonly endpoint: string;
  readonly keys: { readonly p256dh: string; readonly auth: string };
}

/** RFC 8030 §5.3: how soon the push service should wake the phone. */
export type PushUrgency = "very-low" | "low" | "normal" | "high";

export interface PushMessage {
  /** UTF-8 text read by the service worker; at most 3,993 octets once encoded (RFC 8291 §4). */
  readonly payload: string;
  /** How long the push service keeps the message for an unreachable phone (RFC 8030 §5.2). */
  readonly ttl: Duration.Duration;
  /** Absent: the push service treats the message as `normal` (RFC 8030 §5.3). */
  readonly urgency?: PushUrgency;
}

/** The push service no longer knows the subscription (404 or 410, RFC 8030 §7.3): forget it. */
export class PushSubscriptionGone extends Data.TaggedError(
  "PushSubscriptionGone",
)<{ readonly status: number }> {}

/** The subscription cannot be used: endpoint not `https:`, or keys that are not P-256 / 16 octets. */
export class PushSubscriptionInvalid extends Data.TaggedError(
  "PushSubscriptionInvalid",
)<{ readonly reason: string }> {}

/** Over 3,993 octets, refused before sending (RFC 8291 §4), or 413 from the push service. */
export class PushPayloadTooLarge extends Data.TaggedError(
  "PushPayloadTooLarge",
)<{ readonly octets: number }> {}

/**
 * Not delivered for now: 429 or 5xx (RFC 8030 §8.4), or no response. The caller may retry, not
 * before `retryAfter` when the push service gave one.
 */
export class PushServiceUnavailable extends Data.TaggedError(
  "PushServiceUnavailable",
)<{
  readonly status: Option.Option<number>;
  readonly retryAfter: Option.Option<Duration.Duration>;
}> {}

/** 401 or 403: the push service refused our VAPID token or key (RFC 8292 §2). Every send will fail. */
export class PushVapidRefused extends Data.TaggedError("PushVapidRefused")<{
  readonly status: number;
}> {}

/** Any other refusal (400, unexpected status): the request itself is wrong; retrying will not help. */
export class PushRequestRejected extends Data.TaggedError(
  "PushRequestRejected",
)<{ readonly status: number }> {}

export type PushError =
  | PushSubscriptionGone
  | PushSubscriptionInvalid
  | PushPayloadTooLarge
  | PushServiceUnavailable
  | PushVapidRefused
  | PushRequestRejected;

/** Sends one Web Push message to one phone. Never retries: the caller decides (ADR-025). */
export class PushSender extends Context.Service<
  PushSender,
  {
    readonly send: (
      subscription: PushSubscription,
      message: PushMessage,
    ) => Effect.Effect<void, PushError>;
  }
>()("PushSender") {}
