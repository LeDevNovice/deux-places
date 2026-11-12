import { Result, Schema } from "effect";
import { Base64Url } from "effect/encoding";
import { PushSubscriptionInput } from "../contracts/api";
import type { ApiClient } from "../contracts/client";

/** What the page needs from a browser that supports push (W3C Push API, Notifications API). */
export interface PushBrowser {
  readonly requestPermission: () => Promise<NotificationPermission>;
  readonly serviceWorker: {
    readonly ready: Promise<{
      readonly pushManager: {
        readonly subscribe: (
          options: PushSubscriptionOptionsInit,
        ) => Promise<{ toJSON(): unknown }>;
      };
    }>;
  };
}

/** The browser's push, or undefined when it lacks a service worker, push or notifications. */
export const pushBrowser = (): PushBrowser | undefined =>
  "serviceWorker" in navigator &&
  "PushManager" in globalThis &&
  "Notification" in globalThis
    ? {
        requestPermission: () => Notification.requestPermission(),
        serviceWorker: navigator.serviceWorker,
      }
    : undefined;

export type TestNotificationOutcome = "unsupported" | "denied" | "scheduled";

/**
 * « Tester une notification dans 1 min » (plan J1.14): asks the permission, subscribes the phone
 * with the application server's key, gives the household the subscription, then asks for the
 * test notification. Without push or without the permission, it calls neither the push service
 * nor the API. Any other failure rejects.
 */
export const requestTestNotification = async (
  browser: PushBrowser | undefined,
  api: ApiClient,
): Promise<TestNotificationOutcome> => {
  if (browser === undefined) return "unsupported";
  // "default" (no answer) counts as denied (Notifications API).
  if ((await browser.requestPermission()) !== "granted") return "denied";
  const registration = await browser.serviceWorker.ready;
  const { publicKey } = await api.call((client) =>
    client.notifications.publicKey(),
  );
  const subscription = await registration.pushManager.subscribe({
    // Every message shows a notification (required by Chrome and Edge).
    userVisibleOnly: true,
    // Octets rather than the base64url string, which not every browser accepts.
    applicationServerKey: Uint8Array.from(
      Result.getOrThrow(Base64Url.decode(publicKey)),
    ),
  });
  const payload = Schema.decodeUnknownSync(PushSubscriptionInput)(
    subscription.toJSON(),
  );
  await api.call((client) => client.notifications.subscribe({ payload }));
  await api.call((client) => client.notifications.testNotification());
  return "scheduled";
};
