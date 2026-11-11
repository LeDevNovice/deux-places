import { type QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ApiClient } from "../contracts/client";
import { ApiHealth } from "./ApiHealth";
import { appName } from "./messages";

/** Both are built once at startup (main.tsx) and shared by every render. */
export function App({
  api,
  queryClient,
}: {
  readonly api: ApiClient;
  readonly queryClient: QueryClient;
}) {
  return (
    <QueryClientProvider client={queryClient}>
      <main>
        <h1>{appName}</h1>
        <ApiHealth api={api} />
      </main>
    </QueryClientProvider>
  );
}
