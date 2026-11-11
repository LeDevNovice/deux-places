import { Context, Exit } from "effect";
import { AppConfig, loadAppConfig } from "./runtime/config";

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

// Built at the first request and kept for the isolate's lifetime, failure included (§10.2):
// `env` does not change within an isolate, and parsing it per request would spend CPU budget.
let startup: ReturnType<typeof loadAppConfig> | undefined;

export default {
  fetch(
    request: Request,
    env: { readonly Household: Households },
  ): Response | Promise<Response> {
    startup ??= loadAppConfig(env);
    if (Exit.isFailure(startup)) return problem(internalErrorProblem, 500);
    if (new URL(request.url).pathname.startsWith("/api/v1/")) {
      const { durableObjectJurisdiction } = Context.get(
        startup.value,
        AppConfig,
      );
      const households =
        durableObjectJurisdiction === "eu"
          ? env.Household.jurisdiction("eu")
          : env.Household;
      return households
        .get(households.idFromName(developmentHousehold))
        .fetch(request);
    }
    return problem(notFoundProblem, 404);
  },
} satisfies ExportedHandler<Env>;
