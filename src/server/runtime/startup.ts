import { env } from "cloudflare:workers";
import { loadAppConfig, logRefusal } from "./config";

// The configuration (technique-v2 §10.1), built once per isolate when the module loads, from the
// importable `env` (§10.2): the Worker and the Household object share it, and no request pays for
// it. A refusal is an `Exit`, never an exception: the module still loads, pages are still served
// and the API answers its 500 problem.
//
// A value read here keeps the secret it was built from for the isolate's lifetime: Cloudflare may
// keep an isolate when only bindings change (docs « Bindings »), so changing the VAPID keys with
// `wrangler secret put` takes a deploy.
const startup = loadAppConfig(env);
let used = false;

/**
 * The isolate's configuration. Its refusal is logged once per isolate, at the first use, inside the
 * invocation that asks for it: a line written while the module loads would belong to no invocation.
 */
export const appConfig = () => {
  if (!used) {
    used = true;
    logRefusal(startup);
  }
  return startup;
};
