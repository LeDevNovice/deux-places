import { DurableObject } from "cloudflare:workers";
import { Layer, ManagedRuntime } from "effect";
import { makeApiHandler } from "../interface/api";
import * as notifications from "../modules/notifications";
import type { AppConfig } from "./config";
import * as deadlines from "./deadlines";
import { exportHousehold } from "./export";
import {
  answerClose,
  answerPings,
  livePath,
  openLive,
  refuseMessage,
} from "./live";
import { jsonLogs } from "./logging";
import { householdSchemaIsCurrent, migrateHousehold } from "./migrations";
import {
  applicationServerKey,
  notificationsExecutors,
  pushSender,
  testNotificationDeadline,
} from "./notifications";
import { refuseCrossOriginWrite } from "./origin";
import { appConfig } from "./startup";

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
  // Made when the object starts, built by its first use, then reused by every request, alarm and
  // export (§10.2).
  readonly #runtime: ManagedRuntime.ManagedRuntime<
    Layer.Success<ReturnType<typeof householdServices>>,
    unknown
  >;
  // §10.2: the API handler is built once, at the object's first API request; an alarm or an export
  // never pays for it. It builds the household's services through the runtime's memo map: whichever
  // of the two builds them first, they are built once. A failed build is kept: every request fails.
  readonly #buildApiHandler: () => (request: Request) => Promise<Response>;
  #handleApi: ((request: Request) => Promise<Response>) | undefined;
  // What each kind of household deadline runs (technique-v2 §7.3); each plan line that adds a
  // deadline adds its executor here. The push sender has its own runtime: a VAPID pair it cannot
  // import fails the sends only, never the other deadlines.
  readonly #deadlineExecutors: deadlines.DeadlineExecutors<notifications.PushSubscriptions>;

  constructor(ctx: DurableObjectState, env: Cloudflare.Env) {
    super(ctx, env);
    // Requests wait until the schema is migrated (§7.2); the migrator runs only when a migration
    // is missing (§10.2). If migrating fails, the runtime resets the object: no request is served
    // by a half-migrated database.
    void ctx.blockConcurrencyWhile(async () => {
      if (!householdSchemaIsCurrent(ctx.storage))
        await migrateHousehold(ctx.storage);
    });
    answerPings(ctx);
    // The isolate's configuration, read when the module loads (§10.2), never from this object's
    // `env`; a refused configuration fails every request and every send (§10.1).
    const configuration = Layer.effectContext(appConfig());
    const services = householdServices(ctx.storage, configuration);
    const runtime = ManagedRuntime.make(services);
    this.#runtime = runtime;
    this.#buildApiHandler = () => makeApiHandler(services, runtime.memoMap);
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
    return (
      refuseCrossOriginWrite(request) ??
      (this.#handleApi ??= this.#buildApiHandler())(request)
    );
  }

  /**
   * The household's export (technique-v2 §12.4), as JSON text. An RPC method, never an HTTP route
   * of the object: only the Worker calls it, once it has checked the export secret.
   */
  exportHousehold(): Promise<string> {
    return this.#runtime.runPromise(exportHousehold);
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
