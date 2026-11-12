import { DurableObject } from "cloudflare:workers";
import { Effect, Layer } from "effect";
import { makeApiHandler } from "../interface/api";
import * as deadlines from "./deadlines";
import {
  answerClose,
  answerPings,
  livePath,
  openLive,
  refuseMessage,
} from "./live";
import { jsonLogs } from "./logging";
import { migrateHousehold } from "./migrations";

// What each kind of household deadline runs (technique-v2 §7.3). Empty until a plan line adds a
// deadline to the household (J7.3, J7.6, J8.10): each adds its executor here.
const householdDeadlineExecutors: deadlines.DeadlineExecutors = {};

/** One object per household (technique-v2 §4.2): it serves the household's HttpApi. */
export class Household extends DurableObject {
  // Built once per object, when the object starts, and reused by every request (§10.2).
  readonly #handleApi = makeApiHandler(jsonLogs);

  constructor(ctx: DurableObjectState, env: Cloudflare.Env) {
    super(ctx, env);
    // Requests wait until the schema is migrated (§7.2). If migrating fails, the runtime resets
    // the object: no request is served by a half-migrated database.
    void ctx.blockConcurrencyWhile(() => migrateHousehold(ctx.storage));
    answerPings(ctx);
  }

  override fetch(request: Request): Response | Promise<Response> {
    // The live connection is a WebSocket, not an HttpApi route: it is answered before the API.
    if (new URL(request.url).pathname === livePath)
      return openLive(this.ctx, request);
    return this.#handleApi(request);
  }

  // §10.2: the alarm runs the due deadlines, then re-arms on the next one.
  override alarm(): Promise<void> {
    return Effect.runPromise(
      deadlines
        .runDueDeadlines(this.ctx.storage, householdDeadlineExecutors)
        .pipe(
          Effect.provide(
            Layer.mergeAll(deadlines.layer(this.ctx.storage), jsonLogs),
          ),
        ),
    );
  }

  override webSocketMessage(socket: WebSocket): void {
    refuseMessage(socket);
  }

  override webSocketClose(
    socket: WebSocket,
    code: number,
    reason: string,
  ): void {
    answerClose(socket, code, reason);
  }
}
