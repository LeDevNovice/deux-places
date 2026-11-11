import {
  Config,
  ConfigProvider,
  Context,
  Effect,
  Layer,
  Option,
  type Redacted,
} from "effect";
import { jsonLogs } from "./logging";

export class AppConfig extends Context.Service<
  AppConfig,
  {
    readonly tmdbApiKey: Redacted.Redacted;
    readonly vapidPublicKey: string;
    readonly vapidPrivateKey: Redacted.Redacted;
    readonly brevoApiKey: Redacted.Redacted;
    readonly exportSecret: Redacted.Redacted;
    readonly otlp: Option.Option<{
      readonly endpoint: URL;
      readonly headers: Redacted.Redacted;
    }>;
    readonly durableObjectJurisdiction: "eu" | "none";
  }
>()("AppConfig") {}

const otlpExport = Config.all({
  endpoint: Config.URL("OTEL_EXPORTER_OTLP_ENDPOINT"),
  headers: Config.Redacted("OTEL_EXPORTER_OTLP_HEADERS"),
});

// Optional, all or nothing. `Config.option` on the group would turn a half-set group into
// `None` without a word, so as soon as either key is set both become required.
const otlp = Config.all([
  Config.option(Config.String("OTEL_EXPORTER_OTLP_ENDPOINT")),
  Config.option(Config.String("OTEL_EXPORTER_OTLP_HEADERS")),
]).pipe(
  Config.flatMap(([endpoint, headers]) =>
    Option.isNone(endpoint) && Option.isNone(headers)
      ? Config.succeed(Option.none())
      : otlpExport.pipe(Config.map(Option.some)),
  ),
);

// Durable Objects always live in the EU (technique-v2 §10.1). Local workerd does not implement
// jurisdictions, so local runs (.dev.vars, tests) set `none`; absent or empty means `eu`, and any
// other value refuses the startup: a missing or mistyped setting never leaves the EU.
const durableObjectJurisdiction = Config.Literals(
  ["eu", "none"],
  "DURABLE_OBJECT_JURISDICTION",
).pipe(Config.withDefault("eu" as const));

/** Secrets and settings read once at startup; a missing required key fails the startup. */
export const layer = Layer.effect(
  AppConfig,
  Config.all({
    tmdbApiKey: Config.Redacted("TMDB_API_KEY"),
    vapidPublicKey: Config.String("VAPID_PUBLIC_KEY"),
    vapidPrivateKey: Config.Redacted("VAPID_PRIVATE_KEY"),
    brevoApiKey: Config.Redacted("BREVO_API_KEY"),
    exportSecret: Config.Redacted("EXPORT_SECRET"),
    otlp,
    durableObjectJurisdiction,
  }),
);

/**
 * Builds the configuration from the Worker's `env` (secrets and variables). The caller runs it
 * once per isolate or object, never per request; a refusal is logged by key name, never value.
 */
export const loadAppConfig = (env: object) =>
  Effect.runSyncExit(
    Effect.scoped(
      Layer.build(
        layer.pipe(
          Layer.provide(ConfigProvider.layer(ConfigProvider.fromUnknown(env))),
          Layer.tapError((error) =>
            Effect.logError("Configuration refused at startup:", error.message),
          ),
          // The refusal is a JSON line like every other log (§12.1).
          Layer.provide(jsonLogs),
        ),
      ),
    ),
  );
