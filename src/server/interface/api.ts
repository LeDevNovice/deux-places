import { Effect, Layer } from "effect";
import { HttpRouter, HttpServer } from "effect/http";
import { HttpApiBuilder } from "effect/http-api";
import { version } from "../../../package.json";
import { Api, Health } from "../../contracts/api";

// The same report on every call: built once, not per request.
const health = new Health({ status: "ok", version });

// Technical routes, outside every context of technique-v2 §6.1.
const system = HttpApiBuilder.group(Api, "system", (handlers) =>
  handlers.handle("health", () => Effect.succeed(health)),
);

/**
 * Builds the API's web handler (technique-v2 §10.2). Building it costs CPU: the caller does it
 * once and keeps the handler for its lifetime, never per request. No request log yet (J1.8).
 */
export const makeApiHandler = (): ((request: Request) => Promise<Response>) =>
  HttpRouter.toWebHandler(
    HttpApiBuilder.layer(Api).pipe(
      Layer.provide(system),
      Layer.provide(HttpServer.layerServices),
    ),
    { disableLogger: true },
  ).handler;
