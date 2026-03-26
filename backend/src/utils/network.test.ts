import { describe, expect, test } from "bun:test";
import { assertSafeTargetUrl, isForbiddenIpAddress } from "./network";

describe("network safeguards", () => {
  test("blocks private ipv4 addresses", () => {
    expect(isForbiddenIpAddress("127.0.0.1")).toBe(true);
    expect(isForbiddenIpAddress("10.0.0.4")).toBe(true);
    expect(isForbiddenIpAddress("192.168.1.10")).toBe(true);
  });

  test("allows public ipv4 addresses", () => {
    expect(isForbiddenIpAddress("8.8.8.8")).toBe(false);
  });

  test("rejects localhost target urls", async () => {
    const result = await assertSafeTargetUrl("http://127.0.0.1:8080");
    expect(result.ok).toBe(false);
  });
});
