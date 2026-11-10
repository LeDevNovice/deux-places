import { describe, expect, it } from "vitest";
import worker from "./worker";

describe("worker — requests no route handles get a not-found problem (technique-v2 §6.2)", () => {
  it("answers 404", () => {
    const response = worker.fetch();

    expect(response.status).toBe(404);
  });

  it("is an RFC 9457 problem document", () => {
    const response = worker.fetch();

    expect(response.headers.get("Content-Type")).toBe(
      "application/problem+json",
    );
  });

  it("carries the not-found type, a title and the same status, and no instance yet", async () => {
    const response = worker.fetch();

    expect(await response.json()).toStrictEqual({
      type: "/problems/not-found",
      title: "Not Found",
      status: 404,
    });
  });
});
