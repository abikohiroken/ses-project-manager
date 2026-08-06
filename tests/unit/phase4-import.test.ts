import type { CsvImport } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const database = vi.hoisted(() => ({
  csvImport: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  csvImportRow: {
    create: vi.fn(),
    findMany: vi.fn(),
    findFirst: vi.fn(),
    count: vi.fn(),
    groupBy: vi.fn(),
  },
  projectIntake: { findUnique: vi.fn(), create: vi.fn() },
  projectSource: { create: vi.fn() },
  exportBatch: { findUnique: vi.fn(), upsert: vi.fn() },
  transaction: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    csvImport: database.csvImport,
    csvImportRow: database.csvImportRow,
    projectIntake: database.projectIntake,
    projectSource: database.projectSource,
    exportBatch: database.exportBatch,
    $transaction: database.transaction,
  },
}));

import { CSV_HEADERS, type CsvHeader } from "@/lib/csv/csv-contract";
import type { RawCsvRow } from "@/lib/csv/csv-parser";
import type { DriveClient, DriveFile } from "@/lib/google/drive-client";
import {
  determineFileOutcome,
  linkExportBatchIfEligible,
  processDriveFile,
  runGoogleDriveImport,
} from "@/lib/import/import-file";
import { processImportRow } from "@/lib/import/import-row";
import {
  moveCsvImport,
  reconcileStaleImports,
  retryMovePending,
} from "@/lib/import/import-reconcile";

const NOW = new Date("2026-08-06T03:00:00.000Z");

function importRecord(overrides: Partial<CsvImport> = {}): CsvImport {
  return {
    id: "import-id",
    exportBatchId: null,
    driveFileId: "drive-id",
    fileHash: "a".repeat(64),
    fileName: "ses_projects_v1_BATCH-20260806-120000-ABC123.csv",
    schemaVersion: "v1",
    batchId: "BATCH-20260806-120000-ABC123",
    duplicateOfImportId: null,
    status: "PROCESSING",
    driveMoveStatus: "PENDING",
    totalRows: 1,
    successRows: 0,
    failedRows: 0,
    skippedRows: 0,
    attemptCount: 1,
    processingStartedAt: NOW,
    importedAt: null,
    errorCode: null,
    errorMessage: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function rawRow(overrides: Partial<RawCsvRow> = {}): RawCsvRow {
  return {
    reception_id: "RCP-001",
    line_message_id: "LINE-001",
    line_user_id: "",
    line_group_id: "",
    project_name: "案件A",
    project_summary: "",
    required_skills: '["Java"]',
    preferred_skills: "[]",
    role: "",
    process: "",
    unit_price_min_man: "",
    unit_price_max_man: "",
    settlement_range: "",
    start_month: "",
    end_month: "",
    work_days_per_week: "",
    location: "",
    nearest_station: "",
    remote_style: "unknown",
    remote_note: "",
    recruitment_count: "",
    commercial_flow: "",
    interview_count: "",
    foreigner_allowed: "unknown",
    age_limit: "",
    nationality_note: "",
    employment_condition: "",
    source_company: "",
    source_contact: "",
    received_at: "2026-08-06T12:00:00+09:00",
    raw_text: "原文",
    warning_codes: "[]",
    prompt_version: "PROJECT-PARSER-1",
    ...overrides,
  };
}

function csvBytes(rows = [rawRow()]): Uint8Array {
  const quote = (value: string) => `"${value.replaceAll('"', '""')}"`;
  return Buffer.from(
    `\ufeff${CSV_HEADERS.map(quote).join(",")}\r\n${rows
      .map((row) => CSV_HEADERS.map((header: CsvHeader) => quote(row[header])).join(","))
      .join("\r\n")}`,
    "utf8",
  );
}

function driveFile(id = "drive-id"): DriveFile {
  return {
    id,
    name: "ses_projects_v1_BATCH-20260806-120000-ABC123.csv",
    mimeType: "text/csv",
    size: 1_000,
    createdTime: "2026-08-06T02:50:00.000Z",
    modifiedTime: "2026-08-06T02:50:00.000Z",
    parents: ["inbox"],
  };
}

function driveClient(bytes = csvBytes()): DriveClient & {
  listFiles: ReturnType<typeof vi.fn>;
  downloadFile: ReturnType<typeof vi.fn>;
  moveFile: ReturnType<typeof vi.fn>;
} {
  return {
    listFiles: vi.fn().mockResolvedValue([]),
    downloadFile: vi.fn().mockResolvedValue(bytes),
    moveFile: vi.fn().mockResolvedValue(undefined),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  database.csvImport.findUnique.mockResolvedValue(null);
  database.csvImport.findFirst.mockResolvedValue(null);
  database.csvImport.findMany.mockResolvedValue([]);
  database.csvImport.create.mockResolvedValue(importRecord());
  database.csvImport.update.mockImplementation(
    ({ data }: { data: Partial<CsvImport> }) => Promise.resolve(importRecord(data)),
  );
  database.csvImportRow.create.mockResolvedValue({ id: "row-id" });
  database.csvImportRow.findMany.mockResolvedValue([]);
  database.csvImportRow.findFirst.mockResolvedValue(null);
  database.csvImportRow.count.mockResolvedValue(0);
  database.csvImportRow.groupBy.mockResolvedValue([]);
  database.projectIntake.findUnique.mockResolvedValue(null);
  database.projectIntake.create.mockResolvedValue({ id: "intake-id" });
  database.projectSource.create.mockResolvedValue({ id: "source-id" });
  database.exportBatch.findUnique.mockResolvedValue(null);
  database.exportBatch.upsert.mockResolvedValue({ id: "batch-db-id" });
  database.transaction.mockImplementation(
    (callback: (transaction: {
      projectIntake: typeof database.projectIntake;
      projectSource: typeof database.projectSource;
      csvImportRow: typeof database.csvImportRow;
    }) => Promise<unknown>) =>
      callback({
        projectIntake: database.projectIntake,
        projectSource: database.projectSource,
        csvImportRow: database.csvImportRow,
      }),
  );
});

describe("C. ファイル結果判定とSKIPPED 2種", () => {
  it("24. successあり・failedなしはSUCCESS/processed", () => {
    expect(determineFileOutcome(1, 0, 0)).toMatchObject({
      status: "SUCCESS",
      destination: "processed",
    });
  });

  it("25. successあり・failedありはPARTIAL_SUCCESS/processed", () => {
    expect(determineFileOutcome(1, 1, 0)).toMatchObject({
      status: "PARTIAL_SUCCESS",
      destination: "processed",
    });
  });

  it("26. 全行スキップはSKIPPED/processed", () => {
    expect(determineFileOutcome(0, 0, 1)).toMatchObject({
      status: "SKIPPED",
      destination: "processed",
    });
  });

  it("27. successなし・failedありはERROR/error", () => {
    expect(determineFileOutcome(0, 1, 0)).toMatchObject({
      status: "ERROR",
      destination: "error",
    });
  });

  it("28. ファイル重複は元importを設定してFILE_DUPLICATEにする", async () => {
    const client = driveClient();
    database.csvImport.findFirst.mockResolvedValue(importRecord({ id: "original" }));
    database.csvImport.create.mockResolvedValue(
      importRecord({ status: "SKIPPED", duplicateOfImportId: "original" }),
    );

    await processDriveFile(driveFile(), client, NOW);

    expect(database.csvImport.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        status: "SKIPPED",
        duplicateOfImportId: "original",
        errorCode: "FILE_DUPLICATE",
      }),
    });
    expect(database.csvImport.create.mock.calls[0][0].data).not.toHaveProperty("exportBatchId");
  });

  it("29-30. 全行スキップは重複元NULL・ALL_ROWS_SKIPPEDで確定する", async () => {
    const client = driveClient();
    database.csvImport.findUnique.mockImplementation(
      ({ where }: { where: { driveFileId?: string; id?: string } }) =>
        Promise.resolve(where.id ? importRecord() : null),
    );
    database.projectIntake.findUnique.mockResolvedValue({ id: "existing-intake" });
    database.csvImportRow.groupBy.mockResolvedValue([
      { status: "SKIPPED", _count: { _all: 1 } },
    ]);

    await processDriveFile(driveFile(), client, NOW);

    expect(database.csvImport.update).toHaveBeenCalledWith({
      where: { id: "import-id" },
      data: expect.objectContaining({
        status: "SKIPPED",
        duplicateOfImportId: null,
        exportBatchId: null,
        errorCode: "ALL_ROWS_SKIPPED",
      }),
    });
    expect(database.exportBatch.upsert).not.toHaveBeenCalled();
  });
});

describe("D. 重複・競合", () => {
  it("31. drive_file_id既存時に状態別分岐する", async () => {
    const client = driveClient();
    database.csvImport.findUnique.mockResolvedValueOnce(
      importRecord({ status: "SUCCESS", driveMoveStatus: "MOVE_PENDING" }),
    );
    await processDriveFile(driveFile(), client, NOW);
    expect(client.moveFile).toHaveBeenCalledTimes(1);

    client.moveFile.mockClear();
    database.csvImport.findUnique.mockResolvedValueOnce(
      importRecord({ processingStartedAt: new Date(NOW.getTime() - 60 * 60 * 1_000) }),
    );
    await processDriveFile(driveFile(), client, NOW);
    expect(client.downloadFile).not.toHaveBeenCalled();

    database.csvImport.findUnique.mockResolvedValueOnce(
      importRecord({ status: "SUCCESS", driveMoveStatus: "MOVED" }),
    );
    await processDriveFile(driveFile(), client, NOW);
    expect(client.moveFile).not.toHaveBeenCalled();

    database.csvImport.findUnique.mockResolvedValueOnce(
      importRecord({ processingStartedAt: new Date(NOW.getTime() - 3 * 60 * 60 * 1_000) }),
    );
    database.csvImportRow.findMany.mockResolvedValue([]);
    await processDriveFile(driveFile(), client, NOW);
    expect(client.downloadFile).toHaveBeenCalledTimes(1);
  });

  it("32. claim INSERTのP2002を記録せずスキップする", async () => {
    const client = driveClient();
    database.csvImport.create.mockRejectedValue({ code: "P2002" });

    await expect(processDriveFile(driveFile(), client, NOW)).resolves.toBeNull();
    expect(database.csvImportRow.create).not.toHaveBeenCalled();
  });

  it("33. 同一hashのERRORは重複検索対象に含めない", async () => {
    const client = driveClient();
    database.csvImport.create.mockRejectedValue({ code: "P2002" });

    await processDriveFile(driveFile(), client, NOW);

    expect(database.csvImport.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: { in: ["SUCCESS", "PARTIAL_SUCCESS", "SKIPPED"] },
        }),
      }),
    );
  });

  it("34. 同一CSV内の2件目のID重複をERRORにする", async () => {
    const identifiers = { receptionIds: new Set<string>(), lineMessageIds: new Set<string>() };
    await processImportRow("import-id", 1, rawRow(), identifiers);
    await processImportRow("import-id", 2, rawRow(), identifiers);

    expect(database.csvImportRow.create).toHaveBeenLastCalledWith({
      data: expect.objectContaining({ status: "ERROR", errorCode: "DUPLICATE_ID_IN_FILE" }),
    });
  });

  it("35. 2つのIDが別intakeを指す場合はIDENTIFIER_CONFLICT", async () => {
    database.projectIntake.findUnique
      .mockResolvedValueOnce({ id: "intake-a" })
      .mockResolvedValueOnce({ id: "intake-b" });

    await processImportRow(
      "import-id",
      1,
      rawRow(),
      { receptionIds: new Set(), lineMessageIds: new Set() },
    );

    expect(database.csvImportRow.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ status: "ERROR", errorCode: "IDENTIFIER_CONFLICT" }),
    });
  });
});

describe("E. Drive移動とMOVE_PENDING", () => {
  it("36. 成功系をprocessed、ERRORをerrorへ移動する", async () => {
    const client = driveClient();
    await moveCsvImport(importRecord({ status: "SUCCESS" }), client);
    await moveCsvImport(importRecord({ status: "ERROR" }), client);
    expect(client.moveFile).toHaveBeenNthCalledWith(1, "drive-id", "processed");
    expect(client.moveFile).toHaveBeenNthCalledWith(2, "drive-id", "error");
  });

  it("37. DB登録後の移動失敗をMOVE_PENDINGにしDB行を再登録しない", async () => {
    const client = driveClient();
    client.moveFile.mockRejectedValue(new Error("move failed"));
    await expect(moveCsvImport(importRecord(), client)).resolves.toBe("MOVE_PENDING");
    expect(database.csvImport.update).toHaveBeenCalledWith({
      where: { id: "import-id" },
      data: expect.objectContaining({ driveMoveStatus: "MOVE_PENDING" }),
    });
    expect(database.projectIntake.create).not.toHaveBeenCalled();
  });

  it("38. MOVE_PENDING再試行成功でMOVEDにする", async () => {
    const client = driveClient();
    database.csvImport.findMany.mockResolvedValue([
      importRecord({ status: "SUCCESS", driveMoveStatus: "MOVE_PENDING" }),
    ]);
    await expect(retryMovePending(client)).resolves.toBe(1);
    expect(database.csvImport.update).toHaveBeenCalledWith({
      where: { id: "import-id" },
      data: { driveMoveStatus: "MOVED" },
    });
  });

  it("39. 5回目の移動失敗でERRORにする", async () => {
    const client = driveClient();
    client.moveFile.mockRejectedValue(new Error("move failed"));
    await expect(moveCsvImport(importRecord({ attemptCount: 4 }), client)).resolves.toBe("ERROR");
    expect(database.csvImport.update).toHaveBeenCalledWith({
      where: { id: "import-id" },
      data: expect.objectContaining({ attemptCount: 5, driveMoveStatus: "ERROR" }),
    });
  });
});

describe("F. PROCESSING残留の修復", () => {
  it("40. 2時間未満を検索対象にしない", async () => {
    await reconcileStaleImports({ finalize: vi.fn(), resume: vi.fn() }, NOW);
    expect(database.csvImport.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          processingStartedAt: { lt: new Date(NOW.getTime() - 2 * 60 * 60 * 1_000) },
        }),
      }),
    );
  });

  it("41. 2時間以上で全行保存済みなら最終処理へ進む", async () => {
    const record = importRecord({ processingStartedAt: new Date(0), totalRows: 1 });
    const finalize = vi.fn().mockResolvedValue(undefined);
    database.csvImport.findMany.mockResolvedValue([record]);
    database.csvImportRow.count.mockResolvedValue(1);
    await reconcileStaleImports({ finalize, resume: vi.fn() }, NOW);
    expect(finalize).toHaveBeenCalledWith(record);
  });

  it("42. 未完了ならattempt_countを増やして再処理する", async () => {
    const record = importRecord({ processingStartedAt: new Date(0), totalRows: 2 });
    const resume = vi.fn().mockResolvedValue(undefined);
    database.csvImport.findMany.mockResolvedValue([record]);
    database.csvImportRow.count.mockResolvedValue(1);
    await reconcileStaleImports({ finalize: vi.fn(), resume }, NOW);
    expect(database.csvImport.update).toHaveBeenCalledWith({
      where: { id: "import-id" },
      data: { attemptCount: 2, processingStartedAt: NOW },
    });
    expect(resume).toHaveBeenCalled();
  });

  it("43. 5回失敗でstatus=ERRORにする", async () => {
    const record = importRecord({ attemptCount: 4, processingStartedAt: new Date(0) });
    const finalize = vi.fn().mockResolvedValue(undefined);
    database.csvImport.findMany.mockResolvedValue([record]);
    database.csvImportRow.count.mockResolvedValue(0);
    await reconcileStaleImports({ finalize, resume: vi.fn() }, NOW);
    expect(database.csvImport.update).toHaveBeenCalledWith({
      where: { id: "import-id" },
      data: expect.objectContaining({ status: "ERROR", attemptCount: 5 }),
    });
  });
});

describe("G. 内部API・上限", () => {
  it("47. inbox処理を最大10ファイルで打ち切る", async () => {
    const client = driveClient();
    client.listFiles.mockResolvedValue(Array.from({ length: 11 }, (_, index) => driveFile(`file-${index}`)));
    database.csvImport.findUnique.mockResolvedValue(
      importRecord({ status: "SUCCESS", driveMoveStatus: "MOVED" }),
    );
    await runGoogleDriveImport(client, () => NOW);
    expect(database.csvImport.findUnique).toHaveBeenCalledTimes(10);
  });
});

describe("H. export_batches連携", () => {
  it("50. SUCCESS/PARTIAL_SUCCESSだけupsertしてリンクする", async () => {
    const clientFile = driveFile();
    for (const status of ["SUCCESS", "PARTIAL_SUCCESS"] as const) {
      await expect(
        linkExportBatchIfEligible(importRecord({ status }), clientFile, "PROMPT-1", NOW),
      ).resolves.toBe("LINKED");
    }
    expect(database.exportBatch.upsert).toHaveBeenCalledTimes(2);
  });

  it("51. SKIPPED/ERRORではexport_batch_idをリンクしない", async () => {
    for (const status of ["SKIPPED", "ERROR"] as const) {
      await expect(
        linkExportBatchIfEligible(importRecord({ status }), driveFile(), "PROMPT-1", NOW),
      ).resolves.toBe("NOT_APPLICABLE");
    }
    expect(database.exportBatch.upsert).not.toHaveBeenCalled();
    expect(database.csvImport.update).not.toHaveBeenCalled();
  });

  it("52. 既に別importへリンク済みならBATCH_ALREADY_IMPORTEDで継続する", async () => {
    database.exportBatch.findUnique.mockResolvedValue({ id: "batch-db-id" });
    database.csvImport.findFirst.mockResolvedValue({ id: "other-import" });
    await expect(
      linkExportBatchIfEligible(
        importRecord({ status: "SUCCESS" }),
        driveFile(),
        "PROMPT-1",
        NOW,
      ),
    ).resolves.toBe("BATCH_ALREADY_IMPORTED");
    expect(database.exportBatch.upsert).not.toHaveBeenCalled();
    expect(database.csvImport.update).not.toHaveBeenCalled();
  });
});
