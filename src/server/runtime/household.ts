import { DurableObject } from "cloudflare:workers";
import { Layer, ManagedRuntime } from "effect";
import { makeApiHandler } from "../interface/api";
import * as notifications from "../modules/notifications";
import { type AppConfig, loadAppConfig } from "./config";
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
import {
  applicationServerKey,
  notificationsExecutors,
  pushSender,
  testNotificationDeadline,
} from "./notifications";
import { refuseCrossOriginWrite } from "./origin";

// The household's services (technique-v2 §10.2): its SQL client and deadlines on its storage, its
// repositories, the ports its modules declare, its configuration and its logger.
const householdServices = <E>(
  storage: DurableObjectStorage,
  configuration: Layer.Layer<AppConfig, E>,
) =>
  Layer.mergeAll(
    notifications.pushSubscriptionsLayer,
    testNotificationDeadline,
    applicationServerKey,
  ).pipe(
    Layer.provideMerge(deadlines.layer(storage)),
    Layer.provide(configuration),
    Layer.provideMerge(jsonLogs),
  );

/** One object per household (technique-v2 §4.2): it serves the household's HttpApi. */
export class Household extends DurableObject {
  // Built once per object, when the object starts, and reused by every request and alarm (§10.2).
  // The API handler builds the same services through the runtime's memo map: built once.
  readonly #runtime: ManagedRuntime.ManagedRuntime<
    Layer.Success<ReturnType<typeof householdServices>>,
    unknown
  >;
  readonly #handleApi: (request: Request) => Promise<Response>;
  // What each kind of household deadline runs (technique-v2 §7.3); each plan line that adds a
  // deadline adds its executor here. The push sender has its own runtime: a VAPID pair it cannot
  // import fails the sends only, never the other deadlines.
  readonly #deadlineExecutors: deadlines.DeadlineExecutors<notifications.PushSubscriptions>;

  constructor(ctx: DurableObjectState, env: Cloudflare.Env) {
    super(ctx, env);
    // Requests wait until the schema is migrated (§7.2). If migrating fails, the runtime resets
    // the object: no request is served by a half-migrated database.
    void ctx.blockConcurrencyWhile(() => migrateHousehold(ctx.storage));
    answerPings(ctx);
    // Read once per object; a refused configuration fails every request with a 500 (§10.1).
    const configuration = Layer.effectContext(loadAppConfig(env));
    const services = householdServices(ctx.storage, configuration);
    this.#runtime = ManagedRuntime.make(services);
    this.#handleApi = makeApiHandler(services, this.#runtime.memoMap);
    const push = ManagedRuntime.make(
      pushSender.pipe(Layer.provide(configuration)),
    );
    this.#deadlineExecutors = {
      ...notificationsExecutors(push.contextEffect),
    };
  }

  override fetch(request: Request): Response | Promise<Response> {
    // The live connection is a WebSocket, not an HttpApi route: it is answered before the API.
    if (new URL(request.url).pathname === livePath)
      return openLive(this.ctx, request);
    return refuseCrossOriginWrite(request) ?? this.#handleApi(request);
  }

  // §10.2: the alarm runs the due deadlines, then re-arms on the next one.
  override alarm(): Promise<void> {
    return this.#runtime.runPromise(
      deadlines.runDueDeadlines(this.ctx.storage, this.#deadlineExecutors),
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
