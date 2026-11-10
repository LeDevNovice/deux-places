import { Exit } from "effect";
import { loadAppConfig } from "./runtime/config";

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
  fetch(_request: Request, env: Env): Response {
    startup ??= loadAppConfig(env);
    if (Exit.isFailure(startup)) return problem(internalErrorProblem, 500);
    return problem(notFoundProblem, 404);
  },
} satisfies ExportedHandler<Env>;
