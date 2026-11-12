import { Result } from "effect";
import { Base64Url } from "effect/encoding";
import { describe, expect, it, vi } from "vitest";
import { makeApiClient } from "../contracts/client";
import { type PushBrowser, requestTestNotification } from "./push";
import { registerServiceWorker } from "./register-service-worker";

// Plan J1.14. W3C Service Workers: register(scriptURL) without a scope option takes the script's
// directory, `/` for /sw.js. W3C Push API: pushManager.subscribe({ userVisibleOnly,
// applicationServerKey }) gives a PushSubscription whose toJSON() is { endpoint, expirationTime,
// keys: { p256dh, auth } }. Notifications API: Notification.requestPermission() resolves with
// "granted", "denied" or "default" (treated as denied). The browser and `fetch` are faked at their
// border; the API client is the real one (src/contracts/client.ts).

const refusedRegistration = () =>
  Promise.reject(new TypeError("bad MIME type"));

describe("registerServiceWorker — the PWA registers its service worker at startup", () => {
  it("registers the given script once, with the default scope", async () => {
    const register = vi.fn<(url: string) => Promise<unknown>>(() =>
      Promise.resolve({}),
    );

    await registerServiceWorker({ register }, "/sw.js");

    expect(register.mock.calls).toStrictEqual([["/sw.js"]]);
  });

  it("does nothing where the browser has no service workers", async () => {
    await expect(
      registerServiceWorker(undefined, "/sw.js"),
    ).resolves.toBeUndefined();
  });

  it("does not fail the page when the registration is refused", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});

    await expect(
      registerServiceWorker({ register: refusedRegistration }, "/sw.js"),
    ).resolves.toBeUndefined();
    vi.restoreAllMocks();
  });
});

const origin = "https://deux-places.test";
// The VAPID public key the fake API answers: RFC 8291 §5's published sender key (J1.13).
const vapidPublicKey =
  "BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8";

// The receiver's keys published in RFC 8291 §5: test values, never a real subscription.
const subscriptionJson = {
  endpoint: "https://push.example.test/send/1",
  expirationTime: null,
  keys: {
    p256dh:
      "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4",
    auth: "BTBZMqHH6r4Tts7J_aSIgg", // gitleaks:allow (RFC 8291 §5)
  },
};

// A fake API at `origin`: it records each request and answers like the contract says.
function fakeApi() {
  const requests: { method: string; url: string; body: unknown }[] = [];
  const api = makeApiClient({
    baseUrl: origin,
    fetch: async (input, init) => {
      const request = new Request(input, init);
      const text = await request.text();
      requests.push({
        method: request.method,
        url: request.url,
        body: text === "" ? undefined : JSON.parse(text),
      });
      if (request.url === `${origin}/api/v1/push/public-key`)
        return Response.json({ publicKey: vapidPublicKey });
      return new Response(null, { status: 204 });
    },
  });
  return { api, requests };
}

// A browser that supports push, whose user answers `permission`.
function fakeBrowser(permission: NotificationPermission) {
  const subscribe = vi.fn<
    (options: PushSubscriptionOptionsInit) => Promise<{ toJSON(): unknown }>
  >(() => Promise.resolve({ toJSON: () => subscriptionJson }));
  const requestPermission = vi.fn<() => Promise<NotificationPermission>>(() =>
    Promise.resolve(permission),
  );
  const browser: PushBrowser = {
    requestPermission,
    serviceWorker: { ready: Promise.resolve({ pushManager: { subscribe } }) },
  };
  return { browser, subscribe, requestPermission };
}

describe("requestTestNotification — « Tester une notification dans 1 min » (plan J1.14)", () => {
  it("subscribes the phone with userVisibleOnly and the key the API gives, sends the subscription, then asks for the test", async () => {
    const { api, requests } = fakeApi();
    const { browser, subscribe } = fakeBrowser("granted");

    expect(await requestTestNotification(browser, api)).toBe("scheduled");

    expect(subscribe).toHaveBeenCalledOnce();
    const [options] = subscribe.mock.calls[0] ?? [];
    expect(options?.userVisibleOnly).toBe(true);
    expect(options?.applicationServerKey).toStrictEqual(
      Result.getOrThrow(Base64Url.decode(vapidPublicKey)),
    );
    expect(requests).toStrictEqual([
      {
        method: "GET",
        url: `${origin}/api/v1/push/public-key`,
        body: undefined,
      },
      {
        method: "POST",
        url: `${origin}/api/v1/push/subscriptions`,
        body: {
          endpoint: subscriptionJson.endpoint,
          keys: subscriptionJson.keys,
        },
      },
      {
        method: "POST",
        url: `${origin}/api/v1/push/test-notification`,
        body: undefined,
      },
    ]);
  });

  it.each(["denied", "default"] as const)(
    "says so and calls neither the push service nor the API when the permission is %s",
    async (permission) => {
      const { api, requests } = fakeApi();
      const { browser, subscribe } = fakeBrowser(permission);

      expect(await requestTestNotification(browser, api)).toBe("denied");

      expect(subscribe).not.toHaveBeenCalled();
      expect(requests).toStrictEqual([]);
    },
  );

  // A refused subscription (InvalidStateError for another applicationServerKey, a push service
  // that cannot be reached) fails the request: the page says so, and no test is asked for.
  it("rejects, without asking for the test, when the browser refuses to subscribe", async () => {
    const { api, requests } = fakeApi();
    const { browser, subscribe } = fakeBrowser("granted");
    subscribe.mockRejectedValueOnce(
      new DOMException("another key", "InvalidStateError"),
    );

    await expect(requestTestNotification(browser, api)).rejects.toThrow(
      "another key",
    );

    expect(requests.map((request) => request.url)).toStrictEqual([
      `${origin}/api/v1/push/public-key`,
    ]);
  });

  it("says so and calls nothing when the browser does not support push", async () => {
    const { api, requests } = fakeApi();

    expect(await requestTestNotification(undefined, api)).toBe("unsupported");

    expect(requests).toStrictEqual([]);
  });
});
