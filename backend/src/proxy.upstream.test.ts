import { describe, expect, test } from "bun:test";
import {
  filterUpstreamResponseHeaders,
  isUpstreamRedirect,
  isUpstreamTimeout,
  resolveUpstreamUrl
} from "./proxy";

describe("upstream path confinement", () => {
  test("keeps a suffix under the configured target path", () => {
    const resolved = resolveUpstreamUrl("https://example.com/api/v1", "/orders/1");
    expect(resolved.ok).toBe(true);
    if (resolved.ok) {
      expect(new URL(resolved.href).pathname).toBe("/api/v1/orders/1");
    }
  });

  test("rejects dot-dot segments that would escape the target path", () => {
    const resolved = resolveUpstreamUrl("https://example.com/api/v1", "/../../admin");
    expect(resolved.ok).toBe(false);
  });

  test("rejects encoded dot-dot segments", () => {
    const resolved = resolveUpstreamUrl("https://example.com/api/v1", "/%2e%2e/%2e%2e/admin");
    expect(resolved.ok).toBe(false);
  });
});

describe("upstream response policy", () => {
  test("treats 3xx as a redirect that must not be followed", () => {
    expect(isUpstreamRedirect(302)).toBe(true);
    expect(isUpstreamRedirect(200)).toBe(false);
  });

  test("recognises abort and timeout errors", () => {
    expect(isUpstreamTimeout(Object.assign(new Error("timed out"), { name: "TimeoutError" }))).toBe(true);
    expect(isUpstreamTimeout(Object.assign(new Error("aborted"), { name: "AbortError" }))).toBe(true);
    expect(isUpstreamTimeout(new Error("UPSTREAM_REDIRECT"))).toBe(false);
  });

  test("drops hop-by-hop response headers", () => {
    const headers = new Headers({
      "content-type": "application/json",
      "set-cookie": "secret=1",
      upgrade: "websocket",
      te: "trailers",
      trailer: "Expires",
      "proxy-authenticate": "Basic"
    });
    expect(filterUpstreamResponseHeaders(headers)).toEqual({
      "content-type": "application/json"
    });
  });
});
