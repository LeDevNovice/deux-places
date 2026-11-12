import { Cause, Context, Exit, Option, Redacted, Result } from "effect";
import { Base64, Base64Url } from "effect/encoding";
import { assert, describe, expect, it, vi } from "vitest";
import { AppConfig, loadAppConfig } from "./config";

// Obviously fake values: the test never sees a real key. The VAPID pair must be a well-formed
// P-256 pair (§10.1, J1.13): it is the sender pair published in RFC 8291 §5, never a real key.
const fakeVapidPublicKey =
  "BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8";
const fakeVapidPrivateKey = "yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw"; // gitleaks:allow (RFC 8291 §5)
const required = {
  TMDB_API_KEY: "fake-tmdb-api-key",
  VAPID_PUBLIC_KEY: fakeVapidPublicKey,
  VAPID_PRIVATE_KEY: fakeVapidPrivateKey,
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
      // One JSON line, like every Effect log (technique-v2 §12.1, plan J1.8).
      expect(JSON.parse(String(log.mock.calls[0]?.[0]))).toMatchObject({
        level: "ERROR",
      });
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
    expect(config.vapidPublicKey).toBe(fakeVapidPublicKey);
    expect(Redacted.value(config.vapidPrivateKey)).toBe(fakeVapidPrivateKey);
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

// Local workerd does not implement jurisdictions ("Jurisdiction restrictions are not implemented
// in workerd"), so local runs opt out explicitly; anything else keeps the EU (technique-v2 §10.1).
describe("Durable Object jurisdiction (technique-v2 §10.1, local opt-out decided in J1.6)", () => {
  it("is the EU when DURABLE_OBJECT_JURISDICTION is absent", () => {
    expect(configOf(required).durableObjectJurisdiction).toBe("eu");
  });

  it("is the EU when DURABLE_OBJECT_JURISDICTION is empty", () => {
    expect(
      configOf({ ...required, DURABLE_OBJECT_JURISDICTION: "" })
        .durableObjectJurisdiction,
    ).toBe("eu");
  });

  it("is the EU when DURABLE_OBJECT_JURISDICTION says eu", () => {
    expect(
      configOf({ ...required, DURABLE_OBJECT_JURISDICTION: "eu" })
        .durableObjectJurisdiction,
    ).toBe("eu");
  });

  it("is none only when DURABLE_OBJECT_JURISDICTION says none (local runs)", () => {
    expect(
      configOf({ ...required, DURABLE_OBJECT_JURISDICTION: "none" })
        .durableObjectJurisdiction,
    ).toBe("none");
  });

  it.each(["us", "EU", "None", "off"])(
    "refuses to start when DURABLE_OBJECT_JURISDICTION is %s, and names it",
    (value) => {
      expect(
        failureOf({ ...required, DURABLE_OBJECT_JURISDICTION: value }),
      ).toContain("DURABLE_OBJECT_JURISDICTION");
    },
  );
});

// VAPID keys (RFC 8292) in base64url: the public key is the uncompressed P-256 point (65 octets
// from 0x04, the `k=` of RFC 8292 §3.2), the private key its scalar `d` (32 octets). A malformed
// key refuses the startup (§10.1); whether the two form a pair is checked by WebCrypto when the
// push adapter imports them (J1.13).
const encode = (octets: Uint8Array) => Base64Url.encode(octets);
const publicPoint = Result.getOrThrow(Base64Url.decode(fakeVapidPublicKey));

describe("VAPID keys checked at startup (technique-v2 §10.1, RFC 8292)", () => {
  it.each([
    ["not base64url", "fake-vapid-public-key"],
    ["standard base64 instead of base64url", Base64.encode(publicPoint)],
    ["32 octets", fakeVapidPrivateKey],
    [
      "a compressed point",
      encode(Uint8Array.of(0x03, ...publicPoint.slice(1, 33))),
    ],
    [
      "65 octets not starting with 0x04",
      encode(Uint8Array.of(0x05, ...publicPoint.slice(1))),
    ],
  ])(
    "refuses to start when VAPID_PUBLIC_KEY is %s, and names it without its value",
    (_case, value) => {
      const failure = failureOf({ ...required, VAPID_PUBLIC_KEY: value });

      expect(failure).toContain("VAPID_PUBLIC_KEY");
      expect(failure).not.toContain(value);
    },
  );

  it.each([
    ["not base64url", "fake-vapid-private-key"],
    ["31 octets", encode(new Uint8Array(31).fill(7))],
    ["33 octets", encode(new Uint8Array(33).fill(7))],
    ["the public key", fakeVapidPublicKey],
  ])(
    "refuses to start when VAPID_PRIVATE_KEY is %s, and names it without its value",
    (_case, value) => {
      const failure = failureOf({ ...required, VAPID_PRIVATE_KEY: value });

      expect(failure).toContain("VAPID_PRIVATE_KEY");
      expect(failure).not.toContain(value);
    },
  );

  it("logs a malformed private key by name only", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      const malformed = encode(new Uint8Array(31).fill(7));
      failureOf({ ...required, VAPID_PRIVATE_KEY: malformed });

      const written = log.mock.calls.flat().map(String).join(" ");
      expect(written).toContain("VAPID_PRIVATE_KEY");
      expect(written).not.toContain(malformed);
    } finally {
      log.mockRestore();
    }
  });
});
