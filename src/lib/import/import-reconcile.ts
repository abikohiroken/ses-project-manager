import type { CsvImport } from "@prisma/client";

import type { DriveClient } from "@/lib/google/drive-client";
import { googleDriveClient } from "@/lib/google/drive-client";
import { prisma } from "@/lib/prisma";

const MOVE_RETRY_LIMIT = 5;
const STALE_PROCESSING_MS = 2 * 60 * 60 * 1_000;

type MovableImport = Pick<
  CsvImport,
  "id" | "driveFileId" | "status" | "attemptCount"
>;

export async function moveCsvImport(
  csvImport: MovableImport,
  client: DriveClient = googleDriveClient,
): Promise<"MOVED" | "MOVE_PENDING" | "ERROR"> {
  const destination = csvImport.status === "ERROR" ? "error" : "processed";
  try {
    await client.moveFile(csvImport.driveFileId, destination);
    await prisma.csvImport.update({
      where: { id: csvImport.id },
      data: { driveMoveStatus: "MOVED" },
    });
    return "MOVED";
  } catch {
    const attemptCount = csvImport.attemptCount + 1;
    const driveMoveStatus = attemptCount >= MOVE_RETRY_LIMIT ? "ERROR" : "MOVE_PENDING";
    await prisma.csvImport.update({
      where: { id: csvImport.id },
      data: {
        attemptCount,
        driveMoveStatus,
        errorCode: "DRIVE_MOVE_FAILED",
        errorMessage: "Drive上のファイルを移動できませんでした。",
      },
    });
    return driveMoveStatus;
  }
}

export async function retryMovePending(
  client: DriveClient = googleDriveClient,
): Promise<number> {
  const imports = await prisma.csvImport.findMany({
    where: { driveMoveStatus: "MOVE_PENDING" },
    orderBy: { updatedAt: "asc" },
    take: 10,
  });
  let moved = 0;
  for (const csvImport of imports) {
    if ((await moveCsvImport(csvImport, client)) === "MOVED") moved += 1;
  }
  return moved;
}

export type ReconcileCallbacks = {
  finalize: (csvImport: CsvImport) => Promise<void>;
  resume: (csvImport: CsvImport) => Promise<void>;
};

export async function reconcileStaleImports(
  callbacks: ReconcileCallbacks,
  now = new Date(),
): Promise<number> {
  const imports = await prisma.csvImport.findMany({
    where: {
      status: "PROCESSING",
      processingStartedAt: {
        lt: new Date(now.getTime() - STALE_PROCESSING_MS),
      },
    },
    orderBy: { processingStartedAt: "asc" },
  });

  for (const csvImport of imports) {
    const savedRows = await prisma.csvImportRow.count({
      where: { csvImportId: csvImport.id },
    });
    if (csvImport.totalRows > 0 && savedRows >= csvImport.totalRows) {
      await callbacks.finalize(csvImport);
      continue;
    }

    const attemptCount = csvImport.attemptCount + 1;
    if (attemptCount >= MOVE_RETRY_LIMIT) {
      const failed = await prisma.csvImport.update({
        where: { id: csvImport.id },
        data: {
          status: "ERROR",
          attemptCount,
          importedAt: now,
          errorCode: "CSV_PARSE_ERROR",
          errorMessage: "取込処理を再開できませんでした。",
        },
      });
      await callbacks.finalize(failed);
      continue;
    }

    const retrying = await prisma.csvImport.update({
      where: { id: csvImport.id },
      data: { attemptCount, processingStartedAt: now },
    });
    await callbacks.resume(retrying);
  }
  return imports.length;
}
