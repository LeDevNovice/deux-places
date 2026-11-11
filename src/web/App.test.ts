import { QueryClient } from "@tanstack/react-query";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { prerender } from "react-dom/static";
import { describe, expect, it, vi } from "vitest";
import { version } from "../../package.json";
import { makeApiClient } from "../contracts/client";
import { ApiHealth, ApiHealthBoundary } from "./ApiHealth";
import { App } from "./App";
import type * as ClientModule from "../contracts/client";

// Wrapped, not replaced: counts the clients built while the page renders.
vi.mock("../contracts/client", async (importOriginal) => {
  const actual = await importOriginal<typeof ClientModule>();
  return {
    ...actual,
    makeApiClient: vi.fn<typeof actual.makeApiClient>(actual.makeApiClient),
  };
});

// Expectations come from plan line J1.9, the contract (GET /api/v1/health → { status, version },
// technique-v2 §6.1) and package.json, never from the code's output. `fetch` is the boundary.
const origin = "https://deux-places.test";
const healthUrl = `${origin}/api/v1/health`;

type Answer = () => Promise<Response>;

const json =
  (body: unknown, status = 200): Answer =>
  () =>
    Promise.resolve(
      new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
      }),
    );

// A fake API at `origin`: `answer` replies to GET /api/v1/health, any other request is a 404.
function fakeApi(answer: Answer) {
  const requests: Array<string> = [];
  const api = makeApiClient({
    baseUrl: origin,
    fetch: (input, init) => {
      const url = input instanceof Request ? input.url : String(input);
      requests.push(`${init?.method ?? "GET"} ${url}`);
      return url === healthUrl && (init?.method ?? "GET") === "GET"
        ? answer()
        : Promise.resolve(new Response(null, { status: 404 }));
    },
  });
  return { api, requests };
}

// Renders the page and waits for every pending request, as React does for a static prerender.
async function prerenderPage(
  api: ReturnType<typeof makeApiClient>,
  queryClient = new QueryClient(),
) {
  const errors: Array<unknown> = [];
  const { prelude } = await prerender(
    createElement(App, { api, queryClient }),
    {
      onError: (error) => {
        errors.push(error);
      },
    },
  );
  return { text: visibleText(await new Response(prelude).text()), errors };
}

// The text a reader sees: tags, and the attributes where React records a server error, removed.
const visibleText = (markup: string) => markup.replaceAll(/<[^>]*>/g, "");

describe("App shell", () => {
  it("shows the application name « Deux Places »", async () => {
    const { api } = fakeApi(json({ status: "ok", version }));
    const { text } = await prerenderPage(api);

    expect(text).toContain("Deux Places");
  });
});

describe("API health (plan J1.9)", () => {
  // design.md §7.4 shows the application's « version »; PWA and API share it (technique-v2 §6.1).
  it("shows the API version once GET /api/v1/health has answered", async () => {
    const { api, requests } = fakeApi(json({ status: "ok", version }));

    const { text, errors } = await prerenderPage(api);

    expect(text).toBe(`Deux PlacesVersion ${version}`);
    expect(requests).toEqual([`GET ${healthUrl}`]);
    expect(errors).toEqual([]);
  });

  // A version the API could answer after an update (the one used in src/contracts/api.test.ts).
  it("shows the version the API answered, not a fixed one", async () => {
    const { api } = fakeApi(json({ status: "ok", version: "1.4.0" }));

    const { text } = await prerenderPage(api);

    expect(text).toContain("Version 1.4.0");
    expect(text).not.toContain(`Version ${version}`);
  });

  it("shows no version while the request is pending", () => {
    const { api, requests } = fakeApi(() => new Promise<Response>(() => {}));

    const markup = renderToStaticMarkup(
      createElement(App, { api, queryClient: new QueryClient() }),
    );

    expect(requests).toEqual([`GET ${healthUrl}`]);
    expect(markup).toBe("<main><h1>Deux Places</h1></main>");
  });

  // technique-v2 §6.1: the PWA decodes every response with the contract's schema.
  it.each([
    ["an empty version", { status: "ok", version: "" }],
    ["a status other than ok", { status: "degraded", version }],
    ["no version", { status: "ok" }],
  ])(
    "shows no version and reports the failure when the body has %s",
    async (_, body) => {
      const { api } = fakeApi(json(body));

      const { text, errors } = await prerenderPage(api);

      expect(text).toBe("Deux Places");
      expect(errors).toHaveLength(1);
    },
  );

  it.each([
    ["a server error", json({}, 500)],
    [
      "an unreachable API",
      () => Promise.reject(new TypeError("Failed to fetch")),
    ],
  ])(
    "shows no version and reports the failure after %s",
    async (_, answer: Answer) => {
      const { api } = fakeApi(answer);

      const { text, errors } = await prerenderPage(api);

      expect(text).toBe("Deux Places");
      expect(errors).toHaveLength(1);
    },
  );

  // React renders error boundaries in the browser only, never on the server: the boundary is
  // driven here through React's documented protocol (getDerivedStateFromError, then render).
  // design.md has no copy for a failed request, and « Hors ligne » (§5.1) means the phone has no
  // connection: the place of the version stays empty, as while pending.
  it("shows nothing in place of the version once its request has failed", () => {
    const boundary = new ApiHealthBoundary({ children: "Version 1.4.0" });
    expect(renderToStaticMarkup(boundary.render())).toBe("Version 1.4.0");

    boundary.state = ApiHealthBoundary.getDerivedStateFromError();

    expect(renderToStaticMarkup(boundary.render())).toBe("");
  });

  // Without a DOM, a failure never reaches the boundary in these tests: its place in the tree is
  // checked instead (the browser check of the plan line shows it end to end).
  it("puts the health request under that boundary", () => {
    const { api } = fakeApi(json({ status: "ok", version }));

    expect(ApiHealth({ api }).type).toBe(ApiHealthBoundary);
  });

  // The client and the query cache are built once at startup (main.tsx), never per render.
  it("reuses the client and the query cache it is given across renders", async () => {
    const { api, requests } = fakeApi(json({ status: "ok", version }));
    const queryClient = new QueryClient();
    vi.mocked(makeApiClient).mockClear();

    const first = await prerenderPage(api, queryClient);
    const second = await prerenderPage(api, queryClient);

    expect(first.text).toContain(`Version ${version}`);
    expect(second.text).toContain(`Version ${version}`);
    expect(requests).toEqual([`GET ${healthUrl}`]);
    expect(makeApiClient).not.toHaveBeenCalled();
  });
});
