import { describe, expect, it } from "vitest";

describe("unit test project", () => {
  it("runs in a Node environment, without a DOM", () => {
    expect("document" in globalThis).toBe(false);
  });
});
