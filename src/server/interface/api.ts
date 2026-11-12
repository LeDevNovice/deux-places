import { Effect, Layer, Option } from "effect";
import {
  Headers,
  HttpMiddleware,
  HttpRouter,
  HttpServer,
  HttpServerRequest,
} from "effect/http";
import { HttpApiBuilder, HttpApiMiddleware } from "effect/http-api";
import { version } from "../../../package.json";
import {
  Api,
  Health,
  Validation,
  ValidationProblems,
} from "../../contracts/api";
import * as notifications from "../modules/notifications";

// The same report on every call: built once, not per request.
const health = new Health({ status: "ok", version });

// Technical routes, outside every context of technique-v2 §6.1.
const system = HttpApiBuilder.group(Api, "system", (handlers) =>
  handlers.handle("health", () => Effect.succeed(health)),
);

// technique-v2 §6.2: a request the contract cannot decode is the `validation` problem. A response
// the server cannot encode stays the bare 500 of an unexpected error.
const validationProblems = HttpApiMiddleware.layerSchemaErrorTransform(
  ValidationProblems,
  (error) =>
    error.kind === "Body" || error.kind === "ResponseHeaders"
      ? Effect.fail(error)
      : Effect.fail(new Validation()),
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

/** What the household provides to the API's handlers, its logger included. */
export type ApiServices =
  | notifications.ApplicationServerKey
  | notifications.PushSubscriptions
  | notifications.TestNotificationDeadline;

/**
 * Builds the API's web handler (technique-v2 §10.2) with `services`, the logger its requests write
 * to included. Building it costs CPU: the caller does it once and keeps the handler for its
 * lifetime, never per request. With the `memoMap` of the caller's runtime, layers both build are
 * built once (the household's SQL client, for one).
 */
export const makeApiHandler = <E>(
  services: Layer.Layer<ApiServices, E>,
  memoMap?: Layer.MemoMap,
): ((request: Request) => Promise<Response>) =>
  HttpRouter.toWebHandler(
    HttpApiBuilder.layer(Api).pipe(
      Layer.provide([system, notifications.httpGroup]),
      Layer.provide(validationProblems),
      Layer.provide(HttpServer.layerServices),
      Layer.provideMerge(services),
    ),
    {
      // The built-in logger would wrap `requestLog` and miss its annotation: it is composed here.
      disableLogger: true,
      middleware: requestLog,
      ...(memoMap === undefined ? {} : { memoMap }),
    },
  ).handler;
