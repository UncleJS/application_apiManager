import { describe, expect, test } from "bun:test";
import { safeReturnPath } from "./returnTo";

describe("safeReturnPath", () => {
  test("keeps a same-origin path", () => {
    expect(safeReturnPath("/apis?org=1")).toBe("/apis?org=1");
  });

  test("rejects protocol-relative and backslash targets", () => {
    expect(safeReturnPath("//evil.example")).toBe("/apis");
    expect(safeReturnPath("/\\evil.example")).toBe("/apis");
    expect(safeReturnPath("https://evil.example")).toBe("/apis");
    expect(safeReturnPath(null)).toBe("/apis");
  });
});
