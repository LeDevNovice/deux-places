import { useMutation } from "@tanstack/react-query";
import type { ApiClient } from "../contracts/client";
import {
  appName,
  pushDenied,
  pushUnsupported,
  testNotificationButton,
  testNotificationFailed,
  testNotificationScheduled,
} from "./messages";
import {
  type PushBrowser,
  pushBrowser,
  requestTestNotification,
  type TestNotificationOutcome,
} from "./push";

/** The sentence the page shows once a request has ended. */
export const messageFor = (
  outcome: TestNotificationOutcome | "failed",
): string =>
  ({
    scheduled: testNotificationScheduled,
    denied: pushDenied,
    unsupported: pushUnsupported,
    failed: testNotificationFailed,
  })[outcome];

/** What the page says: unsupported at once, then the outcome of the last request, or its failure. */
export const outcomeOf = (
  browser: PushBrowser | undefined,
  request: {
    readonly isError: boolean;
    readonly data: TestNotificationOutcome | undefined;
  },
): TestNotificationOutcome | "failed" | undefined =>
  browser === undefined
    ? "unsupported"
    : request.isError
      ? "failed"
      : request.data;

/**
 * « Tester une notification dans 1 min » (plan J1.14): one button, and what happened. No maquette
 * for this development page: plain HTML, nothing beyond what it must say.
 */
export function DevNotifications({
  api,
  browser,
}: {
  readonly api: ApiClient;
  readonly browser: PushBrowser | undefined;
}) {
  const test = useMutation({
    mutationFn: () => requestTestNotification(browser, api),
  });
  const outcome = outcomeOf(browser, test);
  return (
    <main>
      <h1>{appName}</h1>
      {browser !== undefined && (
        <button
          type="button"
          disabled={test.isPending}
          onClick={() => test.mutate()}
        >
          {testNotificationButton}
        </button>
      )}
      <output>{outcome === undefined ? "" : messageFor(outcome)}</output>
    </main>
  );
}

/** The page with this browser's push, as main.tsx loads it (lazily, outside the initial JS). */
export default function DevNotificationsPage({
  api,
}: {
  readonly api: ApiClient;
}) {
  return <DevNotifications api={api} browser={pushBrowser()} />;
}
