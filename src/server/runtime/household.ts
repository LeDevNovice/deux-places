import { DurableObject } from "cloudflare:workers";
import { makeApiHandler } from "../interface/api";
import { migrateHousehold } from "./migrations";

/** One object per household (technique-v2 §4.2): it serves the household's HttpApi. */
export class Household extends DurableObject {
  // Built once per object, when the object starts, and reused by every request (§10.2).
  readonly #handleApi = makeApiHandler();

  constructor(ctx: DurableObjectState, env: Cloudflare.Env) {
    super(ctx, env);
    // Requests wait until the schema is migrated (§7.2). If migrating fails, the runtime resets
    // the object: no request is served by a half-migrated database.
    void ctx.blockConcurrencyWhile(() => migrateHousehold(ctx.storage));
  }

  override fetch(request: Request): Promise<Response> {
    return this.#handleApi(request);
  }
}
