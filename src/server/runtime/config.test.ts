import { Cause, Context, Exit, Option, Redacted } from "effect";
import { assert, describe, expect, it, vi } from "vitest";
import { AppConfig, loadAppConfig } from "./config";

// Obviously fake values: the test never sees a real key.
const required = {
  TMDB_API_KEY: "fake-tmdb-api-key",
  VAPID_PUBLIC_KEY: "fake-vapid-public-key",
  VAPID_PRIVATE_KEY: "fake-vapid-private-key",
  BREVO_API_KEY: "fake-brevo-api-key",
  EXPORT_SECRET: "fake-export-secret",
};

const configOf = (env: Record<string, string>) => {
  const exit = loadAppConfig(env);
  if (Exit.isFailure(exit))
    assert.fail(`configuration refused: ${Cause.pretty(exit.cause)}`);
  return Context.get(exit.value, AppConfig);
};

const failureOf = (env: Record<string, string>) => {
  const exit = loadAppConfig(env);
  if (Exit.isSuccess(exit))
    assert.fail("expected the configuration to be refused");
  return Cause.pretty(exit.cause);
};

const without = (key: string, env: Record<string, string> = required) =>
  Object.fromEntries(Object.entries(env).filter(([name]) => name !== key));

describe("configuration validated at startup (technique-v2 §10.1)", () => {
  it.each(Object.keys(required))(
    "refuses to start when %s is missing, and names it",
    (key) => {
      expect(failureOf(without(key))).toContain(key);
    },
  );

  it("never shows a present secret in the error about another missing key", () => {
    const failure = failureOf(without("BREVO_API_KEY"));

    for (const value of Object.values(without("BREVO_API_KEY")))
      expect(failure).not.toContain(value);
  });

  it("logs the refusal once, naming the missing key and no secret value", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      failureOf(without("EXPORT_SECRET"));

      expect(log).toHaveBeenCalledTimes(1);
      const written = log.mock.calls.flat().map(String).join(" ");
      expect(written).toContain("EXPORT_SECRET");
      for (const value of Object.values(without("EXPORT_SECRET")))
        expect(written).not.toContain(value);
    } finally {
      log.mockRestore();
    }
  });

  it("treats an empty secret as missing", () => {
    expect(failureOf({ ...required, TMDB_API_KEY: "" })).toContain(
      "TMDB_API_KEY",
    );
  });

  it("loads when every required key is present and OTLP is absent", () => {
    const config = configOf(required);

    expect(Redacted.value(config.tmdbApiKey)).toBe("fake-tmdb-api-key");
    expect(config.vapidPublicKey).toBe("fake-vapid-public-key");
    expect(Redacted.value(config.vapidPrivateKey)).toBe(
      "fake-vapid-private-key",
    );
    expect(Redacted.value(config.brevoApiKey)).toBe("fake-brevo-api-key");
    expect(Redacted.value(config.exportSecret)).toBe("fake-export-secret");
    expect(Option.isNone(config.otlp)).toBe(true);
  });
});

// OTLP export is optional, but all or nothing: an endpoint without its key (or the reverse)
// would lose every trace in silence, so it refuses to start instead (decision recorded in J1.4).
const otlp = {
  OTEL_EXPORTER_OTLP_ENDPOINT: "https://otlp.example.invalid/otlp",
  OTEL_EXPORTER_OTLP_HEADERS: "Authorization=Basic%20fake-otlp-credentials",
};

describe("optional OTLP export configuration (technique-v2 §10.1, §12.1)", () => {
  it("is configured when both the endpoint and its key are present", () => {
    const config = configOf({ ...required, ...otlp });

    const traces = Option.getOrThrow(config.otlp);
    expect(traces.endpoint.href).toBe("https://otlp.example.invalid/otlp");
    expect(Redacted.value(traces.headers)).toBe(
      "Authorization=Basic%20fake-otlp-credentials",
    );
  });

  it.each([
    ["OTEL_EXPORTER_OTLP_HEADERS", "OTEL_EXPORTER_OTLP_ENDPOINT"],
    ["OTEL_EXPORTER_OTLP_ENDPOINT", "OTEL_EXPORTER_OTLP_HEADERS"],
  ])(
    "refuses to start when %s is missing while %s is set, and names it",
    (missing) => {
      expect(failureOf({ ...required, ...without(missing, otlp) })).toContain(
        missing,
      );
    },
  );

  it("refuses an endpoint that is not a URL, and names it", () => {
    expect(
      failureOf({
        ...required,
        ...otlp,
        OTEL_EXPORTER_OTLP_ENDPOINT: "not a url",
      }),
    ).toContain("OTEL_EXPORTER_OTLP_ENDPOINT");
  });
});
