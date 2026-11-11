import { DurableObject } from "cloudflare:workers";
import { makeApiHandler } from "../interface/api";

/** One object per household (technique-v2 §4.2): it serves the household's HttpApi. */
export class Household extends DurableObject {
  // Built once per object, when the object starts, and reused by every request (§10.2).
  readonly #handleApi = makeApiHandler();

  override fetch(request: Request): Promise<Response> {
    return this.#handleApi(request);
  }
}
