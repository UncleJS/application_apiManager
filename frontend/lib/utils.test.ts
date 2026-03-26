import { describe, expect, test } from "bun:test";
import { formatSast, normalizeRole } from "./utils";

describe("frontend utils", () => {
  test("formats SAST timestamps deterministically", () => {
    expect(formatSast("2026-03-26T10:15:30.000Z")).toBe("2026-03-26 12:15:30");
  });

  test("normalizes roles", () => {
    expect(normalizeRole("Org Admin")).toBe("org_admin");
  });
});
