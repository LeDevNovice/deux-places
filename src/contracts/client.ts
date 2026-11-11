import { type Effect, Layer, ManagedRuntime } from "effect";
import { FetchHttpClient } from "effect/http";
import { HttpApiClient } from "effect/http-api";
import { Api } from "./api";

// Without DOM or Workers types (this folder's tsconfig) this resolves to `any`: the PWA, which
// passes the browser's `fetch`, checks it against the DOM type.
type Fetch = (typeof FetchHttpClient.Fetch)["Service"];

/**
 * The PWA's API client, derived from `Api` (technique-v2 §8.1). Every response is decoded by the
 * contract's schemas. The client's modules are unstable, so they stay in this folder (ADR-014):
 * the PWA only sees `call`.
 */
export interface ApiClient {
  /** Runs one request; resolves with its decoded response, rejects with its error. */
  readonly call: <A, E>(
    request: (client: HttpApiClient.ForApi<typeof Api>) => Effect.Effect<A, E>,
  ) => Promise<A>;
}

/**
 * Builds the client once, for the life of the application; `fetch` is the transport and
 * `baseUrl` the origin the API is served from.
 */
export const makeApiClient = (options: {
  readonly baseUrl: string;
  readonly fetch: Fetch;
}): ApiClient => {
  // The stable entry point for running Effects from outside them (here TanStack Query's
  // `queryFn`); the fetch transport reads `Fetch` from the running fiber, so the runtime holds it.
  const runtime = ManagedRuntime.make(
    Layer.merge(
      FetchHttpClient.layer,
      Layer.succeed(FetchHttpClient.Fetch)(options.fetch),
    ),
  );
  const client = runtime.runSync(
    HttpApiClient.make(Api, { baseUrl: options.baseUrl }),
  );
  return { call: (request) => runtime.runPromise(request(client)) };
};
