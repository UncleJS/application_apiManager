import { describe, expect, test } from "bun:test";
import { clearLoginFailures, isLoginLimited, loginAttemptKey, loginClientIp, recordLoginFailure } from "./loginLimit";

describe("login rate limit", () => {
  test("blocks after 10 failures in the window", () => {
    const key = loginAttemptKey("203.0.113.5", "Ada");
    clearLoginFailures(key);
    for (let attempt = 0; attempt < 9; attempt += 1) {
      recordLoginFailure(key, 1_000);
    }
    expect(isLoginLimited(key, 1_000)).toBe(false);
    recordLoginFailure(key, 1_000);
    expect(isLoginLimited(key, 1_000)).toBe(true);
    clearLoginFailures(key);
  });

  test("ignores a spoofed first forwarded hop", () => {
    expect(loginClientIp("127.0.0.1", "1.2.3.4, 203.0.113.9")).toBe("203.0.113.9");
    expect(loginClientIp("203.0.113.9", "1.2.3.4")).toBe("203.0.113.9");
    expect(loginClientIp("::ffff:127.0.0.1", "8.8.8.8, 198.51.100.4")).toBe("198.51.100.4");
  });
});
