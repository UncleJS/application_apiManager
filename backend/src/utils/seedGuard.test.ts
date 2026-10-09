import { describe, expect, test } from "bun:test";
import { assertSeedAllowed, assertSeedPassword } from "./seedGuard";

describe("seed guard", () => {
  test("refuses production", () => {
    expect(() => assertSeedAllowed({ NODE_ENV: "production" })).toThrow(/production/);
  });

  test("allows a one-shot production seed", () => {
    expect(() => assertSeedAllowed({ NODE_ENV: "production", ALLOW_SEED: "true" })).not.toThrow();
  });

  test("refuses a known default password", () => {
    expect(() => assertSeedPassword({ NODE_ENV: "development", SEED_USER_PASSWORD: "010203!@" })).toThrow(/non-default/);
    expect(() => assertSeedPassword({ NODE_ENV: "development" })).toThrow(/non-default/);
  });

  test("accepts a unique password outside production", () => {
    expect(assertSeedPassword({ NODE_ENV: "development", SEED_USER_PASSWORD: "a-unique-seed-password" })).toBe(
      "a-unique-seed-password"
    );
  });
});
