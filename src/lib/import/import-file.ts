import type { CsvImport, CsvImportStatus, DriveMoveStatus } from "@prisma/client";

import { toJstIso } from "@/lib/api/datetime";
import {
  CSV_SCHEMA_VERSION,
  FILE_NAME_PATTERN,
  MAX_CSV_BYTES,
  type ImportRunResult,
} from "@/lib/csv/csv-contract";
import { parseCsvFile, type ParsedCsvFile } from "@/lib/csv/csv-parser";
import { sha256 } from "@/lib/crypto/sha256";
import type { DriveClient, DriveFile } from "@/lib/google/drive-client";
import { googleDriveClient } from "@/lib/google/drive-client";
import { CsvFileError } from "@/lib/import/import-errors";
import { processImportRow, type FileIdentifierState } from "@/lib/import/import-row";
import {
  moveCsvImport,
  reconcileStaleImports,
  retryMovePending,
} from "@/lib/import/import-reconcile";
import { prisma } from "@/lib/prisma";

const RUN_LIMIT_MS = 5 * 60 * 1_000;

export type FileOutcome = {
  status: Exclude<CsvImportStatus, "PENDING" | "PROCESSING">;
  destination: "processed" | "error";
  errorCode: "ALL_ROWS_SKIPPED" | null;
};

export type ProcessedFile = {
  status: Exclude<CsvImportStatus, "PENDING" | "PROCESSING">;
  driveMoveStatus: DriveMoveStatus;
} | null;

function isP2002(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  );
}

export function determineFileOutcome(
  successRows: number,
  failedRows: number,
  skippedRows: number,
): FileOutcome {
  if (successRows > 0 && failedRows === 0) {
    return { status: "SUCCESS", destination: "processed", errorCode: null };
  }
  if (successRows > 0 && failedRows > 0) {
    return { status: "PARTIAL_SUCCESS", destination: "processed", errorCode: null };
  }
  if (successRows === 0 && failedRows === 0 && skippedRows > 0) {
    return {
      status: "SKIPPED",
      destination: "processed",
      errorCode: "ALL_ROWS_SKIPPED",
    };
  }
  return { status: "ERROR", destination: "error", errorCode: null };
}

function parseFileName(fileName: string): { schemaVersion: string; batchId: string } {
  const match = FILE_NAME_PATTERN.exec(fileName);
  if (!match) throw new CsvFileError("INVALID_FILE_NAME");
  if (match[1] !== CSV_SCHEMA_VERSION) {
    throw new CsvFileError("UNSUPPORTED_SCHEMA_VERSION");
  }
  return { schemaVersion: match[1], batchId: match[2] };
}

function logImport(event: string, fields: Record<string, string | number | null>): void {
  console.info(JSON.stringify({ event, ...fields }));
}

async function createEarlyError(
  file: DriveFile,
  code: "INVALID_FILE_NAME" | "UNSUPPORTED_SCHEMA_VERSION" | "FILE_TOO_LARGE" | "DRIVE_DOWNLOAD_FAILED",
  client: DriveClient,
  now: Date,
): Promise<ProcessedFile> {
  let csvImport;
  try {
    csvImport = await prisma.csvImport.create({
      data: {
        driveFileId: file.id,
        fileName: file.name,
        status: "ERROR",
        driveMoveStatus: "PENDING",
        attemptCount: 1,
        importedAt: now,
        errorCode: code,
        errorMessage: new CsvFileError(code).message,
      },
    });
  } catch (error) {
    if (isP2002(error)) {
      logImport("file_already_claimed", {
        drive_file_id: file.id,
        file_name: file.name,
      });
      return null;
    }
    throw error;
  }
  const driveMoveStatus = await moveCsvImport(csvImport, client);
  return { status: "ERROR", driveMoveStatus };
}

export async function linkExportBatchIfEligible(
  csvImport: CsvImport,
  file: DriveFile,
  promptVersion: string,
  now: Date,
): Promise<"LINKED" | "NOT_APPLICABLE" | "BATCH_ALREADY_IMPORTED"> {
  if (csvImport.status !== "SUCCESS" && csvImport.status !== "PARTIAL_SUCCESS") {
    return "NOT_APPLICABLE";
  }
  if (!csvImport.batchId || !csvImport.schemaVersion) return "NOT_APPLICABLE";
  const existingBatch = await prisma.exportBatch.findUnique({
    where: { batchId: csvImport.batchId },
    select: { id: true },
  });
  if (existingBatch) {
    const linked = await prisma.csvImport.findFirst({
      where: {
        exportBatchId: existingBatch.id,
        NOT: { id: csvImport.id },
      },
      select: { id: true },
    });
    if (linked) return "BATCH_ALREADY_IMPORTED";
  }
  const exportBatch = await prisma.exportBatch.upsert({
    where: { batchId: csvImport.batchId },
    create: {
      batchId: csvImport.batchId,
      schemaVersion: csvImport.schemaVersion,
      promptVersion,
      fileName: csvImport.fileName,
      driveFileId: csvImport.driveFileId,
      targetCount: csvImport.totalRows,
      status: "CREATED",
      generatedAt: file.createdTime ? new Date(file.createdTime) : now,
    },
    update: {
      schemaVersion: csvImport.schemaVersion,
      promptVersion,
      fileName: csvImport.fileName,
      driveFileId: csvImport.driveFileId,
      targetCount: csvImport.totalRows,
      status: "CREATED",
      generatedAt: file.createdTime ? new Date(file.createdTime) : now,
      errorMessage: null,
    },
  });
  await prisma.csvImport.update({
    where: { id: csvImport.id },
    data: { exportBatchId: exportBatch.id },
  });
  return "LINKED";
}

async function rowCounts(csvImportId: string) {
  const groups = await prisma.csvImportRow.groupBy({
    by: ["status"],
    where: { csvImportId },
    _count: { _all: true },
  });
  const count = (status: "SUCCESS" | "ERROR" | "SKIPPED") =>
    groups.find((group) => group.status === status)?._count._all ?? 0;
  return {
    successRows: count("SUCCESS"),
    failedRows: count("ERROR"),
    skippedRows: count("SKIPPED"),
  };
}

async function finalizeImport(
  csvImport: CsvImport,
  file: DriveFile,
  promptVersion: string,
  client: DriveClient,
  now: Date,
): Promise<ProcessedFile> {
  if (csvImport.status === "ERROR") {
    const driveMoveStatus = await moveCsvImport(csvImport, client);
    return { status: "ERROR", driveMoveStatus };
  }

  const counts = await rowCounts(csvImport.id);
  const outcome = determineFileOutcome(
    counts.successRows,
    counts.failedRows,
    counts.skippedRows,
  );
  let updated = await prisma.csvImport.update({
    where: { id: csvImport.id },
    data: {
      ...counts,
      status: outcome.status,
      importedAt: now,
      errorCode: outcome.errorCode,
      errorMessage:
        outcome.errorCode === "ALL_ROWS_SKIPPED"
          ? "全データ行が登録済みのためスキップしました。"
          : null,
      // v1.2 §4: 終了状態を確定する時点では未リンクにする。
      exportBatchId: null,
      // v1.2 §1: 全行SKIPPEDでは重複元を設定しない。
      duplicateOfImportId: null,
    },
  });

  if (outcome.status === "SUCCESS" || outcome.status === "PARTIAL_SUCCESS") {
    const batchResult = await linkExportBatchIfEligible(updated, file, promptVersion, now);
    if (batchResult === "BATCH_ALREADY_IMPORTED") {
      updated = await prisma.csvImport.update({
        where: { id: updated.id },
        data: {
          exportBatchId: null,
          errorCode: batchResult,
          errorMessage: "同じbatch_idは別の取込履歴へリンク済みです。",
        },
      });
    } else {
      updated = (await prisma.csvImport.findUnique({ where: { id: updated.id } })) ?? updated;
    }
  }

  const driveMoveStatus = await moveCsvImport(updated, client);
  return { status: outcome.status, driveMoveStatus };
}

async function markFileValidationError(
  csvImport: CsvImport,
  code: CsvFileError["code"],
  client: DriveClient,
  now: Date,
): Promise<ProcessedFile> {
  const failed = await prisma.csvImport.update({
    where: { id: csvImport.id },
    data: {
      status: "ERROR",
      importedAt: now,
      errorCode: code,
      errorMessage: new CsvFileError(code).message,
      exportBatchId: null,
    },
  });
  const driveMoveStatus = await moveCsvImport(failed, client);
  return { status: "ERROR", driveMoveStatus };
}

async function processParsedRows(
  csvImport: CsvImport,
  parsed: ParsedCsvFile,
  file: DriveFile,
  client: DriveClient,
  now: Date,
  existingRows = new Set<number>(),
): Promise<ProcessedFile> {
  await prisma.csvImport.update({
    where: { id: csvImport.id },
    data: { totalRows: parsed.rows.length },
  });
  const existingIdentifiers = await prisma.csvImportRow.findMany({
    where: { csvImportId: csvImport.id },
    select: { receptionId: true, lineMessageId: true },
  });
  const identifiers: FileIdentifierState = {
    receptionIds: new Set(
      existingIdentifiers.flatMap((row) => (row.receptionId ? [row.receptionId] : [])),
    ),
    lineMessageIds: new Set(
      existingIdentifiers.flatMap((row) => (row.lineMessageId ? [row.lineMessageId] : [])),
    ),
  };
  for (let index = 0; index < parsed.rows.length; index += 1) {
    const rowNumber = index + 1;
    if (existingRows.has(rowNumber)) continue;
    await processImportRow(csvImport.id, rowNumber, parsed.rows[index], identifiers);
  }
  const current = (await prisma.csvImport.findUnique({ where: { id: csvImport.id } })) ?? csvImport;
  return finalizeImport(current, file, parsed.promptVersion, client, now);
}

async function resumeStaleImport(
  csvImport: CsvImport,
  client: DriveClient,
  now: Date,
): Promise<void> {
  const bytes = await client.downloadFile(csvImport.driveFileId);
  if (csvImport.fileHash && sha256(bytes) !== csvImport.fileHash) {
    await markFileValidationError(csvImport, "CSV_PARSE_ERROR", client, now);
    return;
  }
  let parsed;
  try {
    parsed = parseCsvFile(bytes);
  } catch (error) {
    if (error instanceof CsvFileError) {
      await markFileValidationError(csvImport, error.code, client, now);
      return;
    }
    throw error;
  }
  const savedRows = await prisma.csvImportRow.findMany({
    where: { csvImportId: csvImport.id },
    select: { rowNumber: true },
  });
  const file: DriveFile = {
    id: csvImport.driveFileId,
    name: csvImport.fileName,
    mimeType: "text/csv",
    size: bytes.byteLength,
    createdTime: null,
    modifiedTime: null,
    parents: [],
  };
  await processParsedRows(
    csvImport,
    parsed,
    file,
    client,
    now,
    new Set(savedRows.map((row) => row.rowNumber)),
  );
}

export async function reconcileImports(
  client: DriveClient = googleDriveClient,
  now = new Date(),
): Promise<number> {
  return reconcileStaleImports(
    {
      finalize: async (csvImport) => {
        const rows = await prisma.csvImportRow.findFirst({
          where: { csvImportId: csvImport.id },
          select: { rawData: true },
        });
        const rawData = rows?.rawData;
        const promptVersion =
          typeof rawData === "object" &&
          rawData !== null &&
          !Array.isArray(rawData) &&
          typeof rawData.prompt_version === "string"
            ? rawData.prompt_version
            : "unknown";
        await finalizeImport(
          csvImport,
          {
            id: csvImport.driveFileId,
            name: csvImport.fileName,
            mimeType: "text/csv",
            size: null,
            createdTime: null,
            modifiedTime: null,
            parents: [],
          },
          promptVersion,
          client,
          now,
        );
      },
      resume: (csvImport) => resumeStaleImport(csvImport, client, now),
    },
    now,
  );
}

export async function processDriveFile(
  file: DriveFile,
  client: DriveClient = googleDriveClient,
  now = new Date(),
): Promise<ProcessedFile> {
  const existing = await prisma.csvImport.findUnique({
    where: { driveFileId: file.id },
  });
  if (existing) {
    if (existing.driveMoveStatus === "MOVE_PENDING") {
      const driveMoveStatus = await moveCsvImport(existing, client);
      if (existing.status === "PENDING" || existing.status === "PROCESSING") return null;
      return { status: existing.status, driveMoveStatus };
    }
    if (existing.status === "PROCESSING") {
      const staleBefore = new Date(now.getTime() - 2 * 60 * 60 * 1_000);
      if (existing.processingStartedAt && existing.processingStartedAt < staleBefore) {
        await resumeStaleImport(existing, client, now);
      }
      return null;
    }
    if (existing.status === "PENDING") return null;
    if (existing.driveMoveStatus === "PENDING") {
      const driveMoveStatus = await moveCsvImport(existing, client);
      return { status: existing.status, driveMoveStatus };
    }
    return null;
  }

  let fileIdentity;
  try {
    fileIdentity = parseFileName(file.name);
  } catch (error) {
    if (error instanceof CsvFileError) {
      return createEarlyError(file, error.code as "INVALID_FILE_NAME" | "UNSUPPORTED_SCHEMA_VERSION", client, now);
    }
    throw error;
  }
  if (file.size !== null && file.size > MAX_CSV_BYTES) {
    return createEarlyError(file, "FILE_TOO_LARGE", client, now);
  }

  let bytes;
  try {
    bytes = await client.downloadFile(file.id);
  } catch {
    return createEarlyError(file, "DRIVE_DOWNLOAD_FAILED", client, now);
  }
  if (bytes.byteLength > MAX_CSV_BYTES) {
    return createEarlyError(file, "FILE_TOO_LARGE", client, now);
  }
  const fileHash = sha256(bytes);
  const duplicate = await prisma.csvImport.findFirst({
    where: {
      fileHash,
      status: { in: ["SUCCESS", "PARTIAL_SUCCESS", "SKIPPED"] },
    },
    orderBy: { importedAt: "asc" },
  });
  if (duplicate) {
    let skipped;
    try {
      skipped = await prisma.csvImport.create({
        data: {
          driveFileId: file.id,
          fileHash,
          fileName: file.name,
          schemaVersion: fileIdentity.schemaVersion,
          batchId: fileIdentity.batchId,
          duplicateOfImportId: duplicate.id,
          status: "SKIPPED",
          driveMoveStatus: "PENDING",
          attemptCount: 1,
          importedAt: now,
          errorCode: "FILE_DUPLICATE",
          errorMessage: "同一内容のCSVは取込済みです。",
        },
      });
    } catch (error) {
      if (isP2002(error)) return null;
      throw error;
    }
    const driveMoveStatus = await moveCsvImport(skipped, client);
    return { status: "SKIPPED", driveMoveStatus };
  }

  let csvImport;
  try {
    // v1.2 §2: ダウンロードとSHA-256算出後に初めてPROCESSINGを作成する。
    csvImport = await prisma.csvImport.create({
      data: {
        driveFileId: file.id,
        fileHash,
        fileName: file.name,
        schemaVersion: fileIdentity.schemaVersion,
        batchId: fileIdentity.batchId,
        status: "PROCESSING",
        driveMoveStatus: "PENDING",
        attemptCount: 1,
        processingStartedAt: now,
      },
    });
  } catch (error) {
    if (isP2002(error)) {
      logImport("file_already_claimed", {
        drive_file_id: file.id,
        file_name: file.name,
      });
      return null;
    }
    throw error;
  }

  let parsed;
  try {
    parsed = parseCsvFile(bytes);
  } catch (error) {
    if (error instanceof CsvFileError) {
      return markFileValidationError(csvImport, error.code, client, now);
    }
    throw error;
  }
  return processParsedRows(csvImport, parsed, file, client, now);
}

export async function runGoogleDriveImport(
  client: DriveClient = googleDriveClient,
  now = () => new Date(),
): Promise<ImportRunResult> {
  const startedAt = now();
  await retryMovePending(client);
  await reconcileImports(client, startedAt);
  const files = await client.listFiles();
  const result: ImportRunResult = {
    checkedAt: toJstIso(startedAt) ?? "",
    listedFiles: files.length,
    processedFiles: 0,
    successFiles: 0,
    partialSuccessFiles: 0,
    errorFiles: 0,
    skippedFiles: 0,
    movePendingFiles: 0,
  };

  for (const file of files.slice(0, 10)) {
    if (now().getTime() - startedAt.getTime() >= RUN_LIMIT_MS) break;
    if (file.mimeType === "application/vnd.google-apps.folder") continue;
    try {
      const processed = await processDriveFile(file, client, now());
      if (!processed) continue;
      result.processedFiles += 1;
      if (processed.status === "SUCCESS") result.successFiles += 1;
      if (processed.status === "PARTIAL_SUCCESS") result.partialSuccessFiles += 1;
      if (processed.status === "ERROR") result.errorFiles += 1;
      if (processed.status === "SKIPPED") result.skippedFiles += 1;
      if (processed.driveMoveStatus === "MOVE_PENDING") result.movePendingFiles += 1;
    } catch {
      result.errorFiles += 1;
      logImport("file_processing_failed", {
        drive_file_id: file.id,
        file_name: file.name,
      });
    }
  }
  return result;
}
