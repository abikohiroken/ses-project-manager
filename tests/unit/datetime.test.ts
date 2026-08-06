import { afterEach, describe, expect, it } from "vitest";

import {
  dbDateToMonth,
  jstDayEndUtc,
  jstDayStartUtc,
  monthToDbDate,
  rangeEnd,
  rangeStart,
} from "@/lib/api/datetime";
import { intakeUpdateSchema } from "@/lib/schemas/intake";

const originalTimezone = process.env.TZ;

afterEach(() => {
  process.env.TZ = originalTimezone;
});

function expectRequiredConversions() {
  expect(monthToDbDate("2026-09").toISOString()).toBe("2026-09-01T00:00:00.000Z");
  expect(dbDateToMonth(new Date("2026-09-01T00:00:00.000Z"))).toBe("2026-09");
  expect(jstDayStartUtc("2026-08-06").toISOString()).toBe("2026-08-05T15:00:00.000Z");
  expect(jstDayEndUtc("2026-08-06").toISOString()).toBe("2026-08-06T14:59:59.999Z");
  expect(rangeStart("2026-08-06T14:20:30+09:00").toISOString()).toBe(
    "2026-08-06T05:20:30.000Z",
  );
  expect(rangeStart("2026-08-06").toISOString()).toBe("2026-08-05T15:00:00.000Z");
  expect(rangeEnd("2026-08-06").toISOString()).toBe("2026-08-06T14:59:59.999Z");
}

describe("month and JST range conversion", () => {
  it("constructs a database month using UTC", () => {
    expect(monthToDbDate("2026-09").toISOString()).toBe("2026-09-01T00:00:00.000Z");
  });

  it("formats a database date as YYYY-MM using UTC getters", () => {
    expect(dbDateToMonth(new Date("2026-09-01T00:00:00.000Z"))).toBe("2026-09");
  });

  it("rejects startMonth later than endMonth", () => {
    expect(() =>
      intakeUpdateSchema.parse({
        updatedAt: "2026-08-06T00:00:00.000Z",
        startMonth: "2026-10",
        endMonth: "2026-09",
      }),
    ).toThrowError(expect.objectContaining({ name: "ZodError" }));
  });

  it("uses the JST day start for receivedFrom and importedFrom", () => {
    expect(rangeStart("2026-08-06").toISOString()).toBe("2026-08-05T15:00:00.000Z");
  });

  it("uses the JST day end for receivedTo and importedTo", () => {
    expect(rangeEnd("2026-08-06").toISOString()).toBe("2026-08-06T14:59:59.999Z");
  });

  it("preserves an offset ISO timestamp as an absolute instant", () => {
    expect(rangeStart("2026-08-06T14:20:30+09:00").toISOString()).toBe(
      "2026-08-06T05:20:30.000Z",
    );
  });

  it("does not change any conversion when process.env.TZ is UTC", () => {
    process.env.TZ = "UTC";
    expectRequiredConversions();
  });
});
