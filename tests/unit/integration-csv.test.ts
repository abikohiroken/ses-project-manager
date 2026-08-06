import { beforeEach, describe, expect, it, vi } from "vitest";

const database = vi.hoisted(() => ({
  csvImport: {
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    count: vi.fn(),
  },
  csvImportRow: { findFirst: vi.fn() },
}));
const dependencies = vi.hoisted(() => ({
  getDriveStatus: vi.fn(),
  requireRole: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: { csvImport: database.csvImport, csvImportRow: database.csvImportRow },
}));
vi.mock("@/lib/google/drive-status", () => ({
  getDriveStatus: dependencies.getDriveStatus,
}));
vi.mock("@/lib/api/guard", () => ({
  requireRole: dependencies.requireRole,
}));

import { GET as getIntegrationStatusRoute } from "@/app/api/integration-status/route";
import { getCsvImport } from "@/lib/services/csv-import-service";
import { getIntegrationStatus } from "@/lib/services/integration-status-service";

const importId = "11111111-1111-4111-8111-111111111111";
const rowId = "22222222-2222-4222-8222-222222222222";
const baseImport = {
  id: importId,
  rows: [
    { id: rowId, rowNumber: 1, status: "ERROR" },
    { id: "33333333-3333-4333-8333-333333333333", rowNumber: 2, status: "SUCCESS" },
  ],
  duplicateOfImport: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  dependencies.getDriveStatus.mockResolvedValue({
    connected: false,
    inboxFiles: null,
    checkedAt: "2026-08-06T12:00:00.000+09:00",
    errorCode: "GOOGLE_DRIVE_UNAVAILABLE",
  });
  dependencies.requireRole.mockResolvedValue({ id: "viewer-id", role: "VIEWER" });
});

describe("G. integration status", () => {
  it("returns DB import aggregates instead of stub values", async () => {
    database.csvImport.findFirst.mockResolvedValue({
      importedAt: new Date("2026-08-06T03:00:00.000Z"),
    });
    database.csvImport.count
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(4);

    const result = await getIntegrationStatus();

    expect(result).toMatchObject({
      drive: { connected: false },
      imports: {
        lastImportedAt: "2026-08-06T12:00:00.000+09:00",
        errorCount: 2,
        partialSuccessCount: 3,
        movePendingCount: 4,
      },
    });
    expect(database.csvImport.count).toHaveBeenCalledTimes(3);
  });

  it("returns HTTP 200 when the Drive stub is disconnected", async () => {
    database.csvImport.findFirst.mockResolvedValue(null);
    database.csvImport.count.mockResolvedValue(0);

    const response = await getIntegrationStatusRoute();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      data: { drive: { connected: false, errorCode: "GOOGLE_DRIVE_UNAVAILABLE" } },
    });
  });
});

describe("G. rawDataRowId", () => {
  it("omits rawData when rawDataRowId is not specified", async () => {
    database.csvImport.findUnique.mockResolvedValue(baseImport);

    const result = await getCsvImport(importId);

    expect(JSON.stringify(result)).not.toContain("rawData");
    expect(database.csvImportRow.findFirst).not.toHaveBeenCalled();
  });

  it("returns NOT_FOUND for a row from another import or a missing row", async () => {
    database.csvImport.findUnique.mockResolvedValue(baseImport);
    database.csvImportRow.findFirst.mockResolvedValue(null);

    await expect(getCsvImport(importId, rowId)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("returns VALIDATION_ERROR for a non-ERROR row", async () => {
    database.csvImport.findUnique.mockResolvedValue(baseImport);
    database.csvImportRow.findFirst.mockResolvedValue({
      id: rowId,
      status: "SUCCESS",
      rawData: { secret: "not-returned" },
    });

    await expect(getCsvImport(importId, rowId)).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
      details: [{ field: "rawDataRowId" }],
    });
  });

  it("includes rawData only on the requested ERROR row", async () => {
    database.csvImport.findUnique.mockResolvedValue(baseImport);
    database.csvImportRow.findFirst.mockResolvedValue({
      id: rowId,
      status: "ERROR",
      rawData: { raw_text: "requested row only" },
    });

    const result = await getCsvImport(importId, rowId);

    expect(result.rows[0]).toMatchObject({
      id: rowId,
      rawData: { raw_text: "requested row only" },
    });
    expect(result.rows[1]).not.toHaveProperty("rawData");
  });
});
