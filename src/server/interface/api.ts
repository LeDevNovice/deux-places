import { Effect, Layer, Option } from "effect";
import {
  Headers,
  HttpMiddleware,
  HttpRouter,
  HttpServer,
  HttpServerRequest,
} from "effect/http";
import { HttpApiBuilder } from "effect/http-api";
import { version } from "../../../package.json";
import { Api, Health } from "../../contracts/api";

// The same report on every call: built once, not per request.
const health = new Health({ status: "ok", version });

// Technical routes, outside every context of technique-v2 §6.1.
const system = HttpApiBuilder.group(Api, "system", (handlers) =>
  handlers.handle("health", () => Effect.succeed(health)),
);

// Set by the Worker on every request it forwards (worker.ts).
const requestIdHeader = "x-request-id";

// The request log (method, path without query, status) carrying the Worker's request id, so both
// lines of one request share it. The logger only reads those fields: never a body or a header.
const requestLog = HttpMiddleware.make((app) => {
  const logged = HttpMiddleware.logger(app);
  return Effect.flatMap(HttpServerRequest.HttpServerRequest, (request) =>
    Option.match(Headers.get(request.headers, requestIdHeader), {
      onNone: () => logged,
      onSome: (requestId) => Effect.annotateLogs(logged, { requestId }),
    }),
  );
});

/**
 * Builds the API's web handler (technique-v2 §10.2) with `logs`, the logger its requests write to.
 * Building it costs CPU: the caller does it once and keeps the handler for its lifetime, never per
 * request; the logger is built with it.
 */
export const makeApiHandler = (
  logs: Layer.Layer<never>,
): ((request: Request) => Promise<Response>) =>
  HttpRouter.toWebHandler(
    HttpApiBuilder.layer(Api).pipe(
      Layer.provide(system),
      Layer.provide(HttpServer.layerServices),
      Layer.provideMerge(logs),
    ),
    // The built-in logger would wrap `requestLog` and miss its annotation: it is composed here.
    { disableLogger: true, middleware: requestLog },
  ).handler;
