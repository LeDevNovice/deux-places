import { useSuspenseQuery } from "@tanstack/react-query";
import { Component, type ReactNode, Suspense } from "react";
import type { ApiClient } from "../contracts/client";
import { versionOf } from "./messages";

function ApiVersion({ api }: { readonly api: ApiClient }) {
  const { data } = useSuspenseQuery({
    queryKey: ["health"],
    queryFn: () => api.call((client) => client.system.health()),
  });
  return <p>{versionOf(data.version)}</p>;
}

/**
 * Keeps the page once the request below has failed (after TanStack Query's retries): without it,
 * React would unmount the whole root. design.md has no copy for a failed request, and « Hors
 * ligne » (§5.1) means the phone has no connection, so nothing is shown, as while pending.
 * React has no function component for this: an error boundary is a class.
 */
export class ApiHealthBoundary extends Component<
  { readonly children: ReactNode },
  { readonly failed: boolean }
> {
  override state = { failed: false };

  static getDerivedStateFromError(): { readonly failed: boolean } {
    return { failed: true };
  }

  override render() {
    return this.state.failed ? null : this.props.children;
  }
}

/** The API's version once `GET /api/v1/health` has answered; nothing while it is pending. */
export function ApiHealth({ api }: { readonly api: ApiClient }) {
  return (
    <ApiHealthBoundary>
      <Suspense fallback={null}>
        <ApiVersion api={api} />
      </Suspense>
    </ApiHealthBoundary>
  );
}
