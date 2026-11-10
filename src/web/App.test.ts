import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { App } from "./App";

describe("App shell", () => {
  it("shows the application name « Deux Places »", () => {
    const markup = renderToStaticMarkup(createElement(App));

    expect(markup).toContain("Deux Places");
  });
});
