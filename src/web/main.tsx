import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { makeApiClient } from "../contracts/client";
import { App } from "./App";
import { devNotificationsPath } from "./dev-notifications-path";
import { registerServiceWorker } from "./register-service-worker";

const container = document.getElementById("root");
if (container === null) {
  throw new Error("index.html has no #root element");
}

// Built once, when the application starts; every render shares them. The API is served from the
// page's own origin (CSP `connect-src 'self'`, technique-v2 §13.3).
const api = makeApiClient({ baseUrl: location.origin, fetch });
const queryClient = new QueryClient();

// Once per start (plan J1.14), after the page's own code; absent where the page is not a secure
// context. The service worker is built by Vite on its own and served at /sw.js (vite.config.ts):
// only its URL is imported, in a chunk of its own.
void import("./service-worker/sw?worker&url").then(({ default: url }) =>
  registerServiceWorker(
    "serviceWorker" in navigator ? navigator.serviceWorker : undefined,
    url,
  ),
);

// The development page is loaded only when asked for: it stays out of the initial JavaScript.
const DevNotificationsPage = lazy(() => import("./DevNotifications"));

createRoot(container).render(
  location.pathname === devNotificationsPath ? (
    <QueryClientProvider client={queryClient}>
      <Suspense fallback={null}>
        <DevNotificationsPage api={api} />
      </Suspense>
    </QueryClientProvider>
  ) : (
    <App api={api} queryClient={queryClient} />
  ),
);
