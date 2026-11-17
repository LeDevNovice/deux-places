import type { LiveMessage } from "../../contracts/live";
import type {
  DomainEventAudience,
  DomainEventKind,
  Json,
} from "../../shared-kernel/domain-event";

/** Path of the household's live connection (technique-v2 §6.3). */
export const livePath = "/api/v1/live";

// RFC 9457 problems with `about:blank`: §6.2 lists no type for a refused opening, and with
// `about:blank` the title is the status phrase (RFC 9457 §4.2.1).
const forbidden = { type: "about:blank", title: "Forbidden", status: 403 };
// §6.2: an input the server refuses, as the contract's `Validation` writes it (src/contracts/api.ts).
const validation = {
  type: "/problems/validation",
  title: "Bad Request",
  status: 400,
};
// RFC 9110 §15.5.22: a 426 names the protocol to switch to in `Upgrade`.
const upgradeRequired = {
  type: "about:blank",
  title: "Upgrade Required",
  status: 426,
};

const problem = (
  body: { readonly status: number },
  headers: Record<string, string> = {},
) =>
  new Response(JSON.stringify(body), {
    status: body.status,
    headers: { "Content-Type": "application/problem+json", ...headers },
  });

// A sequence number in decimal digits, without sign nor leading zero: what `String(n)` writes.
const decimal = /^(?:0|[1-9]\d*)$/;

/**
 * The last sequence number the phone received, from `?since=` (technique-v2 §6.3, « Reprise »):
 * `absent` when it sends none, `refused` unless it is one integer from 0 to 2^53 − 1 written in
 * decimal digits (beyond, a JavaScript number no longer holds it exactly).
 */
export const sinceOf = (url: URL): number | "absent" | "refused" => {
  const values = url.searchParams.getAll("since");
  if (values.length === 0) return "absent";
  const [value] = values;
  if (values.length > 1 || value === undefined || !decimal.test(value))
    return "refused";
  const since = Number(value);
  return Number.isSafeInteger(since) ? since : "refused";
};

/** An event as `domain_events` stores it: its payload is JSON text. */
export interface StoredEvent {
  readonly sequence: number;
  readonly kind: DomainEventKind;
  readonly audience: DomainEventAudience;
  readonly payload: string;
}

/** A payload as `domain_events` stores it: JSON text, checked by the table (`json_valid`). */
export const parseJson = (text: string): Json => JSON.parse(text);

/** The message that sends a stored event to a phone (src/contracts/live.ts). */
export const eventMessage = (event: StoredEvent): LiveMessage => ({
  type: "event",
  sequence: event.sequence,
  kind: event.kind,
  payload: parseJson(event.payload),
});

/**
 * The most events a reconnection replays (decision of J2.4). Each one is a row read (§7.4) and a
 * message sent under the 10 ms CPU budget of the opening (§10.3); beyond it, reloading what the
 * phone shows costs it less.
 */
export const maxReplay = 100;

/**
 * What the opening sends a phone whose last received number is `since`, when the household's
 * latest number is `latest` (technique-v2 §6.3, « Reprise »). `stored` holds every event from
 * `since` (from 1 when `since` is 0) to `latest`, ascending. The household's events after `since`
 * are replayed, the internal ones never; when they cannot all be, the phone is asked to resync:
 * `since` above `latest` (a database restored to an earlier point never gave that number), a
 * missing event (the one the phone last received included: rows replaced by a restore), or more
 * than `maxReplay` events to send.
 */
export const replayOf = (
  since: number,
  latest: number,
  stored: readonly StoredEvent[],
): readonly LiveMessage[] => {
  const first = since === 0 ? 1 : since;
  const complete =
    since <= latest &&
    latest - since <= maxReplay &&
    stored.length === latest - first + 1 &&
    stored.every((event, index) => event.sequence === first + index);
  if (!complete) return [{ type: "resync", sequence: latest }];
  return stored
    .filter((event) => event.sequence > since && event.audience === "household")
    .map(eventMessage);
};

/**
 * The phone's keep-alive (technique-v2 §6.3, "Veille"): the platform answers `ping` with `pong`
 * itself, without waking the object or calling `webSocketMessage`. Set at every start: the object
 * is rebuilt when it wakes from hibernation.
 */
export const answerPings = (
  ctx: Pick<DurableObjectState, "setWebSocketAutoResponse">,
): void => {
  ctx.setWebSocketAutoResponse(
    new WebSocketRequestResponsePair("ping", "pong"),
  );
};

/**
 * The household's answer to a request on its live path (technique-v2 §6.3, §13.3): a refusal for a
 * request that is not a WebSocket upgrade (426), from another origin (403), or with a `since` that
 * is not a sequence number (400, `validation` of §6.2); otherwise the `since` the object opens the
 * connection with (domain-events.ts, `openLive`).
 */
export const openingOf = (
  request: Request,
): Response | { readonly since: number | "absent" } => {
  // A WebSocket only. RFC 6455 §4.2.1: the `websocket` token is case-insensitive; workerd already
  // writes it in lower case when it forwards an upgrade (probe in PROGRESS, J1.11).
  if (request.headers.get("Upgrade") !== "websocket")
    return problem(upgradeRequired, { Upgrade: "websocket" });
  // §13.3: only the page's own origin may open it. The site's address is chosen at checkpoint A
  // (ADR-017), so it is the request's own origin, never a configured one. A browser always sends
  // `Origin` when it opens a WebSocket: without it, the opening is refused.
  const url = new URL(request.url);
  if (request.headers.get("Origin") !== url.origin) return problem(forbidden);
  const since = sinceOf(url);
  return since === "refused" ? problem(validation) : { since };
};

/**
 * The phone never commands through the WebSocket (technique-v2 §6.3): any message reaching the
 * object closes the connection with 1008, the "policy violation" code of RFC 6455.
 */
export const refuseMessage = (socket: WebSocket): void => {
  socket.close(1008, "Server to phone only");
};

// RFC 6455 §7.4.1: codes that only report a closure and may never be sent (workerd throws).
const unsendableCloseCodes = new Set([1005, 1006, 1015]);

/**
 * Sends the Close frame back to a phone that closed its connection (RFC 6455 §5.5.1). The docs say
 * the runtime does it from compatibility date 2026-04-07; for hibernated WebSockets, workerd
 * 1.20261103.1 does not (probe in PROGRESS, J1.11). The same docs say that closing a socket the
 * runtime already closed is ignored, so this stays right once the runtime does it.
 */
export const answerClose = (
  socket: WebSocket,
  code: number,
  reason: string,
): void => {
  if (unsendableCloseCodes.has(code)) socket.close();
  else socket.close(code, reason);
};
