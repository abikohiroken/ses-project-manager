import { describe, expect, it } from "vitest";

import { mapPrismaError } from "@/lib/api/errors";

describe("Prisma error mapping", () => {
  it.each([
    ["reception_id", "DUPLICATE_RECEPTION_ID"],
    ["line_message_id", "DUPLICATE_LINE_MESSAGE_ID"],
    ["drive_file_id", "DUPLICATE_DRIVE_FILE"],
    ["file_hash", "DUPLICATE_FILE_HASH"],
  ] as const)("maps P2002 target %s", (target, expected) => {
    const mapped = mapPrismaError({
      code: "P2002",
      meta: { target: [target] },
    });
    expect(mapped.code).toBe(expected);
    expect(mapped.status).toBe(409);
  });

  it.each([
    ["P2025", "NOT_FOUND", 404],
    ["P2034", "OPTIMISTIC_LOCK_CONFLICT", 409],
    ["P2024", "DATABASE_UNAVAILABLE", 503],
    ["P2037", "DATABASE_UNAVAILABLE", 503],
  ] as const)("maps %s to %s", (prismaCode, expectedCode, expectedStatus) => {
    const mapped = mapPrismaError({ code: prismaCode });
    expect(mapped.code).toBe(expectedCode);
    expect(mapped.status).toBe(expectedStatus);
  });

  it("maps unknown errors without exposing their contents", () => {
    const mapped = mapPrismaError(new Error("connection string and SQL"));
    expect(mapped.code).toBe("INTERNAL_ERROR");
    expect(mapped.status).toBe(500);
    expect(mapped.message).not.toContain("connection string");
  });
});
