import { DurableObject } from "cloudflare:workers";

/** The single directory (technique-v2 §4.2). Only its binding exists so far: nothing routes here. */
export class Directory extends DurableObject {
  override fetch(): Response {
    return new Response(null, { status: 404 });
  }
}
