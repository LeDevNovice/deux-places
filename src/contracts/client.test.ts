import { Effect, ManagedRuntime } from "effect";
import { HttpApiClient } from "effect/http-api";
import { describe, expect, it, vi } from "vitest";
import { makeApiClient } from "./client";
import type * as EffectModule from "effect";
import type * as HttpApiModule from "effect/http-api";

// Wrapped, not replaced: the real constructors run, the spies only count them.
vi.mock("effect", async (importOriginal) => {
  const actual = await importOriginal<typeof EffectModule>();
  return {
    ...actual,
    ManagedRuntime: {
      ...actual.ManagedRuntime,
      make: vi.fn<typeof actual.ManagedRuntime.make>(
        actual.ManagedRuntime.make,
      ),
    },
  };
});
vi.mock("effect/http-api", async (importOriginal) => {
  const actual = await importOriginal<typeof HttpApiModule>();
  return {
    ...actual,
    HttpApiClient: {
      ...actual.HttpApiClient,
      make: vi.fn<typeof actual.HttpApiClient.make>(actual.HttpApiClient.make),
    },
  };
});

// No call below reaches the network: the requests only read the client they are given.
const noRequest = () => Promise.reject(new Error("no request expected"));

describe("API client of the PWA (technique-v2 §8.1)", () => {
  it("is built once when created, then reused by every call", async () => {
    vi.mocked(HttpApiClient.make).mockClear();
    vi.mocked(ManagedRuntime.make).mockClear();

    const api = makeApiClient({
      baseUrl: "https://deux-places.test",
      fetch: noRequest,
    });
    const first = await api.call((client) => Effect.succeed(client));
    const second = await api.call((client) => Effect.succeed(client));

    expect(second).toBe(first);
    expect(HttpApiClient.make).toHaveBeenCalledTimes(1);
    expect(ManagedRuntime.make).toHaveBeenCalledTimes(1);
  });
});
