import { describe, it, expect } from "vitest";
import { gqlEndpoint } from "./client";

describe("gqlEndpoint", () => {
  it("is an absolute URL graphql-request can parse", () => {
    const url = gqlEndpoint();
    // graphql-request calls `new URL(url)` — a bare path would throw here.
    expect(() => new URL(url)).not.toThrow();
    expect(url).toMatch(/^https?:\/\/.+\/gitlab\/graphql$/);
  });
});
