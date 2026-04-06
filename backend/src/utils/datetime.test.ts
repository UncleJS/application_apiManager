import { describe, expect, test } from "bun:test";
import { serializeUtcFields, toUtcIso } from "./datetime";

describe("datetime serialization", () => {
  test("converts SQL UTC timestamps to ISO 8601", () => {
    expect(toUtcIso("2026-04-05 10:15:30")).toBe("2026-04-05T10:15:30.000Z");
  });

  test("serializes nested _utc fields recursively", () => {
    expect(
      serializeUtcFields({
        created_at_utc: "2026-04-05 10:15:30",
        items: [{ updated_at_utc: "2026-04-05 10:20:30" }],
      })
    ).toEqual({
      created_at_utc: "2026-04-05T10:15:30.000Z",
      items: [{ updated_at_utc: "2026-04-05T10:20:30.000Z" }],
    });
  });

  test("serializes Date-backed _utc fields without collapsing them", () => {
    const serialized = serializeUtcFields({
      created_at_utc: new Date("2026-04-06T02:36:58.000Z"),
      nested: [{ last_activity_utc: new Date("2026-04-06T02:37:33.000Z") }],
    }) as unknown as {
      created_at_utc: string;
      nested: { last_activity_utc: string }[];
    };

    expect(serialized).toEqual({
      created_at_utc: "2026-04-06T02:36:58.000Z",
      nested: [{ last_activity_utc: "2026-04-06T02:37:33.000Z" }],
    });
  });
});
