import { QueryClient } from "@tanstack/react-query";
import { createRoot } from "react-dom/client";
import { makeApiClient } from "../contracts/client";
import { App } from "./App";

const container = document.getElementById("root");
if (container === null) {
  throw new Error("index.html has no #root element");
}

// Built once, when the application starts; every render shares them. The API is served from the
// page's own origin (CSP `connect-src 'self'`, technique-v2 §13.3).
const api = makeApiClient({ baseUrl: location.origin, fetch });
const queryClient = new QueryClient();

createRoot(container).render(<App api={api} queryClient={queryClient} />);
