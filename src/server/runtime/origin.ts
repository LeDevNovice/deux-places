// technique-v2 §13.3: `Origin` is checked on every write. GET and HEAD read; every other method
// may write. RFC 9457 problem with `about:blank`, as for a refused WebSocket opening (live.ts):
// §6.2 lists no type for it, and the title is then the status phrase (RFC 9457 §4.2.1).
const forbidden = JSON.stringify({
  type: "about:blank",
  title: "Forbidden",
  status: 403,
});

const reads = new Set(["GET", "HEAD"]);

/**
 * A 403 problem for a write that does not come from the page's own origin, else `undefined`. The
 * site's address is chosen at checkpoint A (ADR-017), so the origin is the request's own, never a
 * configured one. A browser always sends `Origin` with a POST (Fetch standard, "append a request
 * `Origin` header"): a write without it is refused.
 */
export const refuseCrossOriginWrite = (
  request: Request,
): Response | undefined =>
  reads.has(request.method) ||
  request.headers.get("Origin") === new URL(request.url).origin
    ? undefined
    : new Response(forbidden, {
        status: 403,
        headers: { "Content-Type": "application/problem+json" },
      });
