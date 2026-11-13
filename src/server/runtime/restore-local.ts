import { Household as DeployedHousehold } from "./household";
import { type ImportOutcome, restoreHousehold } from "./import";

// The Worker entry of `pnpm restore:local` (plan J1.16), and only of it: scripts/restore-local.mjs
// starts it locally in place of src/server/worker.ts, with the same wrangler.jsonc (worker name,
// classes), so that it reaches the same local Durable Objects as `pnpm dev`. It is never deployed:
// wrangler.jsonc's main is worker.ts, which imports nothing of this file nor of ./import.

export { Directory } from "./directory";

/** The deployed household, plus the import that only the local restore may call. */
export class Household extends DeployedHousehold {
  /** Replaces the household's data with an export's (runtime/import.ts). */
  importHousehold(exported: string): Promise<ImportOutcome> {
    return restoreHousehold(this.ctx.storage, exported);
  }
}

// The fixed development household of worker.ts until J3.6; local workerd has no jurisdictions.
const developmentHousehold = "development";

interface Households {
  idFromName(name: string): DurableObjectId;
  get(id: DurableObjectId): {
    importHousehold(exported: string): Promise<ImportOutcome>;
  };
}

/** `POST /restore` with the export's text: 200 `{ restored }` or 422 `{ refused }`. */
export default {
  async fetch(
    request: Request,
    env: { readonly Household: Households },
  ): Promise<Response> {
    if (
      new URL(request.url).pathname !== "/restore" ||
      request.method !== "POST"
    )
      return new Response(null, { status: 404 });
    const household = env.Household.get(
      env.Household.idFromName(developmentHousehold),
    );
    const outcome = await household.importHousehold(await request.text());
    return Response.json(outcome, {
      status: "restored" in outcome ? 200 : 422,
    });
  },
};
