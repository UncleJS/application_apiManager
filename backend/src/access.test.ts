import { describe, expect, test } from "bun:test";
import { DateTime } from "luxon";
import { evaluateWindows, type AccessWindowRow } from "./access";
import { SAST_TZ } from "./access";

// Helper: build a SAST DateTime for a given ISO weekday (1=Mon..7=Sun) + HH:mm.
function sastAt(weekday: number, hour: number, minute: number): DateTime {
  // 2026-06-08 is a Monday (weekday 1); offset to the requested weekday.
  const monday = DateTime.fromObject(
    { year: 2026, month: 6, day: 8, hour, minute },
    { zone: SAST_TZ }
  );
  return monday.plus({ days: weekday - 1 });
}

const MON = 1;
const TUE = 2;
const SUN = 7;

describe("evaluateWindows", () => {
  test("no windows → denied", () => {
    expect(evaluateWindows([], sastAt(MON, 12, 0))).toBe(false);
  });

  test("inside a same-day window → allowed", () => {
    const rows: AccessWindowRow[] = [
      { day_of_week: MON, start_time: "09:00", end_time: "17:00", is_active: 1 }
    ];
    expect(evaluateWindows(rows, sastAt(MON, 12, 0))).toBe(true);
  });

  test("before a same-day window opens → denied", () => {
    const rows: AccessWindowRow[] = [
      { day_of_week: MON, start_time: "09:00", end_time: "17:00", is_active: 1 }
    ];
    expect(evaluateWindows(rows, sastAt(MON, 8, 59))).toBe(false);
  });

  test("boundaries are inclusive (start and end minute) → allowed", () => {
    const rows: AccessWindowRow[] = [
      { day_of_week: MON, start_time: "09:00", end_time: "17:00", is_active: 1 }
    ];
    expect(evaluateWindows(rows, sastAt(MON, 9, 0))).toBe(true);
    expect(evaluateWindows(rows, sastAt(MON, 17, 0))).toBe(true);
  });

  test("after a same-day window closes → denied", () => {
    const rows: AccessWindowRow[] = [
      { day_of_week: MON, start_time: "09:00", end_time: "17:00", is_active: 1 }
    ];
    expect(evaluateWindows(rows, sastAt(MON, 17, 1))).toBe(false);
  });

  test("inactive window is ignored even when time matches → denied", () => {
    const rows: AccessWindowRow[] = [
      { day_of_week: MON, start_time: "09:00", end_time: "17:00", is_active: 0 }
    ];
    expect(evaluateWindows(rows, sastAt(MON, 12, 0))).toBe(false);
  });

  test("wrong day → denied", () => {
    const rows: AccessWindowRow[] = [
      { day_of_week: MON, start_time: "09:00", end_time: "17:00", is_active: 1 }
    ];
    expect(evaluateWindows(rows, sastAt(TUE, 12, 0))).toBe(false);
  });

  describe("midnight-spanning window (start > end, e.g. 22:00→02:00 on Monday)", () => {
    const rows: AccessWindowRow[] = [
      { day_of_week: MON, start_time: "22:00", end_time: "02:00", is_active: 1 }
    ];

    test("late Monday night (after start, same day) → allowed", () => {
      expect(evaluateWindows(rows, sastAt(MON, 23, 30))).toBe(true);
    });

    test("early Tuesday morning (before end, rolls over to next day) → allowed", () => {
      expect(evaluateWindows(rows, sastAt(TUE, 1, 0))).toBe(true);
    });

    test("Tuesday after the tail end closes → denied", () => {
      expect(evaluateWindows(rows, sastAt(TUE, 2, 1))).toBe(false);
    });

    test("Monday afternoon (gap before the window opens) → denied", () => {
      expect(evaluateWindows(rows, sastAt(MON, 12, 0))).toBe(false);
    });

    test("week wraps correctly: Sunday→Monday window, early Monday → allowed", () => {
      const wrap: AccessWindowRow[] = [
        { day_of_week: SUN, start_time: "23:00", end_time: "01:00", is_active: 1 }
      ];
      expect(evaluateWindows(wrap, sastAt(MON, 0, 30))).toBe(true);
    });
  });

  test("multiple windows: any active match → allowed", () => {
    const rows: AccessWindowRow[] = [
      { day_of_week: MON, start_time: "09:00", end_time: "10:00", is_active: 1 },
      { day_of_week: MON, start_time: "14:00", end_time: "15:00", is_active: 1 }
    ];
    expect(evaluateWindows(rows, sastAt(MON, 14, 30))).toBe(true);
    expect(evaluateWindows(rows, sastAt(MON, 11, 0))).toBe(false);
  });
});
