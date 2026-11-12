/** Path of the household's live connection (technique-v2 §6.3). */
export const livePath = "/api/v1/live";

// RFC 9457 problems with `about:blank`: §6.2 lists no type for a refused opening, and with
// `about:blank` the title is the status phrase (RFC 9457 §4.2.1).
const forbidden = { type: "about:blank", title: "Forbidden", status: 403 };
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
 * Accepts the phone's WebSocket with the hibernation API: the object may sleep while it stays
 * open (technique-v2 §6.3, ADR-019).
 */
export const openLive = (
  ctx: Pick<DurableObjectState, "acceptWebSocket">,
  request: Request,
): Response => {
  // A WebSocket only. RFC 6455 §4.2.1: the `websocket` token is case-insensitive; workerd already
  // writes it in lower case when it forwards an upgrade (probe in PROGRESS, J1.11).
  if (request.headers.get("Upgrade") !== "websocket")
    return problem(upgradeRequired, { Upgrade: "websocket" });
  // §13.3: only the page's own origin may open it. The site's address is chosen at checkpoint A
  // (ADR-017), so it is the request's own origin, never a configured one. A browser always sends
  // `Origin` when it opens a WebSocket: without it, the opening is refused.
  if (request.headers.get("Origin") !== new URL(request.url).origin)
    return problem(forbidden);
  const { 0: client, 1: server } = new WebSocketPair();
  ctx.acceptWebSocket(server);
  return new Response(null, { status: 101, webSocket: client });
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

/**
 * Sends one message to every open connection of the household (technique-v2 §6.3). A connection
 * the household closed stays in `getWebSockets()` until its phone answers, and `send` on it throws.
 */
export const broadcast = (
  ctx: Pick<DurableObjectState, "getWebSockets">,
  message: string,
): void => {
  for (const socket of ctx.getWebSockets())
    if (socket.readyState === WebSocket.OPEN) socket.send(message);
};
