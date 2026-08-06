import { Prisma } from "@prisma/client";

import { rangeEnd, rangeStart } from "@/lib/api/datetime";
import { ApiError } from "@/lib/api/errors";
import { pageOffset, pagination, type PageInput } from "@/lib/api/pagination";
import { prisma } from "@/lib/prisma";
import type { CsvImportQuery } from "@/lib/schemas/csv-import";

const csvListSelect = {
  id: true,
  fileName: true,
  batchId: true,
  status: true,
  driveMoveStatus: true,
  totalRows: true,
  successRows: true,
  failedRows: true,
  skippedRows: true,
  importedAt: true,
  errorCode: true,
} satisfies Prisma.CsvImportSelect;

const csvDetailSelect = {
  id: true,
  exportBatchId: true,
  driveFileId: true,
  fileHash: true,
  fileName: true,
  schemaVersion: true,
  batchId: true,
  status: true,
  driveMoveStatus: true,
  totalRows: true,
  successRows: true,
  failedRows: true,
  skippedRows: true,
  attemptCount: true,
  processingStartedAt: true,
  importedAt: true,
  errorCode: true,
  errorMessage: true,
  createdAt: true,
  updatedAt: true,
  duplicateOfImport: {
    select: { id: true, fileName: true, batchId: true, importedAt: true },
  },
  rows: {
    orderBy: { rowNumber: "asc" as const },
    select: {
      id: true,
      rowNumber: true,
      receptionId: true,
      lineMessageId: true,
      status: true,
      errorCode: true,
      errorMessage: true,
      projectIntakeId: true,
      createdAt: true,
    },
  },
} satisfies Prisma.CsvImportSelect;

const csvSort = {
  "importedAt:desc": { importedAt: "desc" },
  "importedAt:asc": { importedAt: "asc" },
  "createdAt:desc": { createdAt: "desc" },
  "createdAt:asc": { createdAt: "asc" },
} as const satisfies Record<CsvImportQuery["sort"], Prisma.CsvImportOrderByWithRelationInput>;

function csvWhere(query: CsvImportQuery): Prisma.CsvImportWhereInput {
  const where: Prisma.CsvImportWhereInput = {};
  if (query.status) where.status = query.status;
  if (query.driveMoveStatus) where.driveMoveStatus = query.driveMoveStatus;
  if (query.fileName) where.fileName = { contains: query.fileName, mode: "insensitive" };
  if (query.batchId) where.batchId = { contains: query.batchId, mode: "insensitive" };
  if (query.importedFrom || query.importedTo) {
    where.importedAt = {
      ...(query.importedFrom ? { gte: rangeStart(query.importedFrom) } : {}),
      ...(query.importedTo ? { lte: rangeEnd(query.importedTo) } : {}),
    };
  }
  return where;
}

export async function listCsvImports(query: CsvImportQuery, page: PageInput) {
  const where = csvWhere(query);
  const [rows, total] = await Promise.all([
    prisma.csvImport.findMany({
      where,
      select: csvListSelect,
      orderBy: csvSort[query.sort],
      skip: pageOffset(page),
      take: page.pageSize,
    }),
    prisma.csvImport.count({ where }),
  ]);
  return { data: rows, pagination: pagination(page, total) };
}

export async function getCsvImport(id: string, rawDataRowId?: string) {
  const csvImport = await prisma.csvImport.findUnique({
    where: { id },
    select: csvDetailSelect,
  });
  if (!csvImport) throw new ApiError("NOT_FOUND");
  if (!rawDataRowId) return csvImport;

  const requestedRow = await prisma.csvImportRow.findFirst({
    where: { id: rawDataRowId, csvImportId: id },
    select: { id: true, status: true, rawData: true },
  });
  if (!requestedRow) throw new ApiError("NOT_FOUND");
  if (requestedRow.status !== "ERROR") {
    throw new ApiError("VALIDATION_ERROR", [
      { field: "rawDataRowId", reason: "ERROR行のみrawDataを取得できます。" },
    ]);
  }

  return {
    ...csvImport,
    rows: csvImport.rows.map((row) =>
      row.id === requestedRow.id ? { ...row, rawData: requestedRow.rawData } : row,
    ),
  };
}
