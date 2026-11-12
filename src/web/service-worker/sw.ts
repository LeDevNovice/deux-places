// The PWA's service worker (plan J1.14): it shows the household's push messages, nothing else yet
// (no cache before J7.8, no notification action before J8.10). Built by Vite on its own, as one
// classic script served at /sw.js, so that its scope is the whole site (vite.config.ts).
import type { PushPayload } from "../../contracts/push";
import { appName, testNotificationBody } from "../messages";

// In a module, this names the global scope the browser runs the worker in.
declare const self: ServiceWorkerGlobalScope;

// The type the server named, or undefined when the payload is absent or not readable as JSON
// (PushMessageData.json() throws then).
const typeOf = (data: PushMessageData | null): unknown => {
  try {
    const payload: unknown = data?.json();
    return typeof payload === "object" && payload !== null && "type" in payload
      ? payload.type
      : undefined;
  } catch {
    return undefined;
  }
};

// The tag identifies what a notification is about: a new one replaces the one shown with the
// same tag (Notifications API) instead of piling up.
const notificationOf = (
  type: unknown,
): { readonly title: string; readonly options: NotificationOptions } => {
  const test: PushPayload["type"] = "test";
  if (type === test)
    return {
      title: appName,
      options: { body: testNotificationBody, tag: test },
    };
  // A user-visible push must show something (W3C Push API `userVisibleOnly`).
  return { title: appName, options: { tag: "unknown" } };
};

self.addEventListener("push", (event) => {
  const { title, options } = notificationOf(typeOf(event.data));
  // The browser may stop the worker once the handler returns: it waits for the notification.
  event.waitUntil(self.registration.showNotification(title, options));
});
