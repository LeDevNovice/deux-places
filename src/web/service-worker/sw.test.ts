import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { appName, testNotificationBody } from "../messages";

// Plan J1.14. W3C Push API: a `push` event (PushEvent) carries `data`, a PushMessageData or null,
// whose json() parses the bytes as JSON and throws on anything else. Service Workers: the event's
// waitUntil(promise) keeps the worker alive until the promise settles. Notifications API:
// registration.showNotification(title, options); a notification with the tag of a shown one
// replaces it. The browser is faked at its border: the global scope, its registration, the event.

type Listener = (event: FakePushEvent) => void;

interface FakePushEvent {
  readonly data: { json(): unknown; text(): string } | null;
  waitUntil(promise: Promise<unknown>): void;
}

const listeners = new Map<string, Listener[]>();
const shown: { title: string; options: NotificationOptions | undefined }[] = [];
let showing: Promise<void> = Promise.resolve();

// The service worker's global scope (`self`), as far as the service worker uses it.
const scope = {
  addEventListener(type: string, listener: Listener) {
    listeners.set(type, [...(listeners.get(type) ?? []), listener]);
  },
  registration: {
    showNotification(title: string, options?: NotificationOptions) {
      shown.push({ title, options });
      return showing;
    },
  },
};

beforeAll(async () => {
  vi.stubGlobal("self", scope);
  await import("./sw");
});

beforeEach(() => {
  shown.length = 0;
  showing = Promise.resolve();
});

// PushMessageData whose bytes are `text` (UTF-8): json() parses them as JSON, as the spec says.
const dataOf = (text: string) => ({
  json: (): unknown => JSON.parse(text),
  text: () => text,
});

// Dispatches one push event to every `push` listener; returns what they passed to waitUntil.
const push = (data: FakePushEvent["data"]) => {
  const waited: Promise<unknown>[] = [];
  for (const listener of listeners.get("push") ?? [])
    listener({ data, waitUntil: (promise) => void waited.push(promise) });
  return waited;
};

describe("service worker — a push message shows a notification (plan J1.14)", () => {
  it("listens to push events, with one listener", () => {
    expect(listeners.get("push")).toHaveLength(1);
  });

  it("shows the test notification, tagged test, for the test payload", () => {
    void push(dataOf('{"type":"test"}'));

    expect(shown).toStrictEqual([
      { title: appName, options: { body: testNotificationBody, tag: "test" } },
    ]);
  });

  // Without waitUntil, the browser may stop the worker before the notification is shown.
  it("keeps the event alive until the notification is shown (waitUntil)", async () => {
    const { promise, resolve: shownNow } = Promise.withResolvers<void>();
    showing = promise;

    const waited = push(dataOf('{"type":"test"}'));

    expect(waited).toHaveLength(1);
    const settled = vi.fn<() => void>();
    void waited[0]?.then(settled);
    await Promise.resolve();
    expect(settled).not.toHaveBeenCalled();
    shownNow();
    await waited[0];
    expect(settled).toHaveBeenCalledOnce();
  });

  // A user-visible push must show something (W3C Push API `userVisibleOnly`): a payload the worker
  // cannot read gets the application's name alone, under its own tag, and no error escapes.
  it.each([
    ["no payload", null],
    ["a payload that is not JSON", dataOf("not json")],
    ["JSON without a type", dataOf("[1, 2]")],
    ["a type it does not know", dataOf('{"type":"later"}')],
  ])("shows the application's name, tagged unknown, for %s", (_, data) => {
    expect(() => void push(data)).not.toThrow();

    expect(shown).toStrictEqual([
      { title: appName, options: { tag: "unknown" } },
    ]);
  });
});
