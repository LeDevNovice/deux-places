import { DurableObject } from "cloudflare:workers";
import { Effect, Layer, ManagedRuntime } from "effect";
import { makeApiHandler } from "../interface/api";
import * as notifications from "../modules/notifications";
import type { AppConfig } from "./config";
import * as deadlines from "./deadlines";
import * as events from "./domain-events";
import { exportHousehold } from "./export";
import {
  answerClose,
  answerPings,
  livePath,
  openingOf,
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

// The household's internal reactions to its events (technique-v2 §5.4), by name: none yet. Each
// plan line that adds one (Souvenirs, Notifications) adds it here.
const householdReactions: events.EventReactions = {};

// The household's services (technique-v2 §10.2): its SQL client, deadlines and events on its
// storage, its repositories, the ports its modules declare, its configuration and its logger.
const householdServices = <E>(
  storage: DurableObjectStorage,
  configuration: Layer.Layer<AppConfig, E>,
) =>
  Layer.mergeAll(
    notifications.pushSubscriptionsLayer,
    testNotificationDeadline,
    applicationServerKey,
    events.layer(householdReactions),
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

  override async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    // The live connection is a WebSocket, not an HttpApi route: it is answered before the API.
    if (url.pathname === livePath) {
      const opening = openingOf(request);
      if (opening instanceof Response) return opening;
      return this.#runtime.runPromise(
        events
          .openLive(this.ctx, opening.since)
          .pipe(Effect.tap(() => this.#settle())),
      );
    }
    const refused = refuseCrossOriginWrite(request);
    if (refused !== undefined) return refused;
    const response = await (this.#handleApi ??= this.#buildApiHandler())(
      request,
    );
    await this.#runtime.runPromise(this.#settle());
    return response;
  }

  // Once an invocation's work is done: its committed events go to the phones and its reactions
  // run (technique-v2 §5.4).
  #settle() {
    return events.settle(this.ctx, householdReactions);
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
      deadlines
        .runDueDeadlines(this.ctx.storage, this.#deadlineExecutors)
        .pipe(Effect.andThen(this.#settle())),
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
