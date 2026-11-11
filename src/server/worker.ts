import { Context, Effect, Exit, ManagedRuntime } from "effect";
import { AppConfig, loadAppConfig } from "./runtime/config";
import { jsonLogs } from "./runtime/logging";

// Durable Object classes are exported by the Worker's main module (wrangler.jsonc).
export { Directory } from "./runtime/directory";
export { Household } from "./runtime/household";

// Fixed development household until J3.6 resolves the household from the session.
const developmentHousehold = "development";

// The part of the `Household` binding the Worker uses; the generated `Env` provides it.
interface Households {
  jurisdiction(jurisdiction: "eu"): Households;
  idFromName(name: string): DurableObjectId;
  get(id: DurableObjectId): { fetch(request: Request): Promise<Response> };
}

// The part of the static-assets binding the Worker uses: it serves the PWA's pages.
interface Assets {
  fetch(request: Request): Promise<Response>;
}

// RFC 9457 problem, type from technique-v2 §6.2. No `instance` until requests carry a trace id.
const notFoundProblem = JSON.stringify({
  type: "/problems/not-found",
  title: "Not Found",
  status: 404,
});
// An unexpected error answers a 500 without detail (§6.2): the missing key is only logged.
const internalErrorProblem = JSON.stringify({
  type: "about:blank",
  title: "Internal Server Error",
  status: 500,
});

const problem = (body: string, status: number) =>
  new Response(body, {
    status,
    headers: { "Content-Type": "application/problem+json" },
  });

// technique-v2 §13.3, the only security header the specification sets.
const contentSecurityPolicy = [
  "default-src 'self'",
  "img-src 'self' https://image.tmdb.org data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
].join("; ");

// Responses from bindings have immutable headers: copy, then add the policy.
const withSecurityHeaders = (response: Response) => {
  const secured = new Response(response.body, response);
  secured.headers.set("Content-Security-Policy", contentSecurityPolicy);
  return secured;
};

// JSON log lines (technique-v2 §12.1), built once per isolate, never per request (§10.2).
const logs = ManagedRuntime.make(jsonLogs);

// Carries the Worker's request id to the household, which writes it on its own log line. The
// Worker always sets it, so an id sent by the phone never reaches the household.
const requestIdHeader = "X-Request-Id";

// Built at the first API request and kept for the isolate's lifetime, failure included (§10.2):
// `env` does not change within an isolate, and parsing it per request would spend CPU budget.
let startup: ReturnType<typeof loadAppConfig> | undefined;

const route = (
  request: Request,
  env: { readonly Household: Households; readonly ASSETS: Assets },
  requestId: string,
): Response | Promise<Response> => {
  const { pathname } = new URL(request.url);
  // Pages need no configuration: they load even when the API cannot start.
  if (!pathname.startsWith("/api/")) return env.ASSETS.fetch(request);
  startup ??= loadAppConfig(env);
  if (Exit.isFailure(startup)) return problem(internalErrorProblem, 500);
  if (pathname.startsWith("/api/v1/")) {
    const { durableObjectJurisdiction } = Context.get(startup.value, AppConfig);
    const households =
      durableObjectJurisdiction === "eu"
        ? env.Household.jurisdiction("eu")
        : env.Household;
    const headers = new Headers(request.headers);
    headers.set(requestIdHeader, requestId);
    return households
      .get(households.idFromName(developmentHousehold))
      .fetch(new Request(request, { headers }));
  }
  return problem(notFoundProblem, 404);
};

export default {
  async fetch(
    request: Request,
    env: { readonly Household: Households; readonly ASSETS: Assets },
  ): Promise<Response> {
    const requestId = crypto.randomUUID();
    const response = withSecurityHeaders(await route(request, env, requestId));
    // Method, status and, for the API, the path without its query string: never a header, a query
    // or a body (§12.1). A page path may carry a credential (invitation link /i/<code>, §9.3).
    const { pathname } = new URL(request.url);
    logs.runSync(
      Effect.log("Sent HTTP response").pipe(
        Effect.annotateLogs({
          requestId,
          "http.method": request.method,
          ...(pathname.startsWith("/api/") && { "http.url": pathname }),
          "http.status": response.status,
        }),
      ),
    );
    return response;
  },
} satisfies ExportedHandler<Env>;
