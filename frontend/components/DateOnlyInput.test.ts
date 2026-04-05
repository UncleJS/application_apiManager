import { describe, expect, test } from "bun:test";
import { sanitizeDateOnlyInput } from "./DateOnlyInput";

describe("DateOnlyInput", () => {
  test("formats typed digits as yyyy-mm-dd", () => {
    expect(sanitizeDateOnlyInput("20260405")).toBe("2026-04-05");
    expect(sanitizeDateOnlyInput("2026-04")).toBe("2026-04");
  });

  test("drops non-digits and caps length", () => {
    expect(sanitizeDateOnlyInput("2026/04/05abc")).toBe("2026-04-05");
    expect(sanitizeDateOnlyInput("202604051234")).toBe("2026-04-05");
  });
});
