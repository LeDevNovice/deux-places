import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { makeApiClient } from "../contracts/client";
import { DevNotifications, messageFor, outcomeOf } from "./DevNotifications";
import {
  pushDenied,
  pushUnsupported,
  testNotificationButton,
  testNotificationFailed,
  testNotificationScheduled,
} from "./messages";
import type { PushBrowser } from "./push";

// Plan J1.14: the development page « Tester une notification dans 1 min ». No maquette: one button,
// and one sentence saying what happened. `fetch` and the browser are faked at their border.
const requests: string[] = [];
const api = makeApiClient({
  baseUrl: "https://deux-places.test",
  fetch: (input) => {
    requests.push(new Request(input).url);
    return Promise.resolve(new Response(null, { status: 204 }));
  },
});

const aBrowser: PushBrowser = {
  requestPermission: () => Promise.resolve("granted"),
  serviceWorker: { ready: new Promise(() => {}) },
};

const render = (browser: PushBrowser | undefined) =>
  renderToStaticMarkup(
    createElement(
      QueryClientProvider,
      { client: new QueryClient() },
      createElement(DevNotifications, { api, browser }),
    ),
  );

describe("Development page « Tester une notification dans 1 min » (plan J1.14)", () => {
  it("offers the button where the browser supports push, and calls nothing before it is pressed", () => {
    const markup = render(aBrowser);

    expect(markup).toContain(
      `<button type="button">${testNotificationButton}</button>`,
    );
    expect(requests).toStrictEqual([]);
  });

  it("says that the browser does not support push, without a button", () => {
    const markup = render(undefined);

    expect(markup).toContain(pushUnsupported);
    expect(markup).not.toContain("<button");
  });

  it.each([
    ["scheduled", testNotificationScheduled],
    ["denied", pushDenied],
    ["unsupported", pushUnsupported],
    ["failed", testNotificationFailed],
  ] as const)("says what happened once the request is %s", (outcome, text) => {
    expect(messageFor(outcome)).toBe(text);
  });
});

describe("Development page — what it says after a request", () => {
  it("says the request failed when it was rejected", () => {
    expect(outcomeOf(aBrowser, { isError: true, data: undefined })).toBe(
      "failed",
    );
  });

  it("says the outcome the request resolved with", () => {
    expect(outcomeOf(aBrowser, { isError: false, data: "denied" })).toBe(
      "denied",
    );
  });

  it("says nothing before the first request", () => {
    expect(outcomeOf(aBrowser, { isError: false, data: undefined })).toBe(
      undefined,
    );
  });

  it("says push is unsupported whatever happened", () => {
    expect(outcomeOf(undefined, { isError: true, data: undefined })).toBe(
      "unsupported",
    );
  });
});
