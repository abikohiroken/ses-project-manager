import type { Prisma } from "@prisma/client";

import { monthToUtcDate, normalizeCsvRow } from "@/lib/csv/csv-normalizer";
import type { RawCsvRow } from "@/lib/csv/csv-parser";
import { CsvRowError, importErrorMessage } from "@/lib/import/import-errors";
import { prisma } from "@/lib/prisma";

export type ImportRowOutcome = "SUCCESS" | "ERROR" | "SKIPPED";

export type FileIdentifierState = {
  receptionIds: Set<string>;
  lineMessageIds: Set<string>;
};

function rawJson(raw: RawCsvRow): Prisma.InputJsonObject {
  return { ...raw };
}

function isP2002(error: unknown): error is { code: "P2002"; meta?: Record<string, unknown> } {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  );
}

function p2002Target(error: { meta?: Record<string, unknown> }): string {
  const target = error.meta?.target;
  if (Array.isArray(target)) return target.join(" ");
  return typeof target === "string" ? target : "";
}

async function saveNonSuccessRow(
  csvImportId: string,
  rowNumber: number,
  raw: RawCsvRow,
  status: "ERROR" | "SKIPPED",
  code:
    | "DUPLICATE_ID_IN_FILE"
    | "DUPLICATE_RECEPTION_ID"
    | "DUPLICATE_LINE_MESSAGE_ID"
    | "IDENTIFIER_CONFLICT"
    | "VALIDATION_ERROR"
    | CsvRowError["code"],
): Promise<ImportRowOutcome> {
  await prisma.csvImportRow.create({
    data: {
      csvImportId,
      rowNumber,
      receptionId: raw.reception_id || null,
      lineMessageId: raw.line_message_id || null,
      status,
      errorCode: code,
      errorMessage: importErrorMessage(code),
      rawData: rawJson(raw),
    },
  });
  return status;
}

export async function processImportRow(
  csvImportId: string,
  rowNumber: number,
  raw: RawCsvRow,
  identifiers: FileIdentifierState,
): Promise<ImportRowOutcome> {
  let row;
  try {
    row = normalizeCsvRow(raw, rowNumber);
  } catch (error) {
    if (error instanceof CsvRowError) {
      return saveNonSuccessRow(csvImportId, rowNumber, raw, "ERROR", error.code);
    }
    throw error;
  }

  if (
    identifiers.receptionIds.has(row.receptionId) ||
    identifiers.lineMessageIds.has(row.lineMessageId)
  ) {
    return saveNonSuccessRow(
      csvImportId,
      rowNumber,
      raw,
      "ERROR",
      "DUPLICATE_ID_IN_FILE",
    );
  }
  identifiers.receptionIds.add(row.receptionId);
  identifiers.lineMessageIds.add(row.lineMessageId);

  const [byReception, byLineMessage] = await Promise.all([
    prisma.projectIntake.findUnique({
      where: { receptionId: row.receptionId },
      select: { id: true },
    }),
    prisma.projectIntake.findUnique({
      where: { lineMessageId: row.lineMessageId },
      select: { id: true },
    }),
  ]);

  if (byReception && byLineMessage && byReception.id !== byLineMessage.id) {
    return saveNonSuccessRow(
      csvImportId,
      rowNumber,
      raw,
      "ERROR",
      "IDENTIFIER_CONFLICT",
    );
  }
  if (byReception) {
    return saveNonSuccessRow(
      csvImportId,
      rowNumber,
      raw,
      "SKIPPED",
      "DUPLICATE_RECEPTION_ID",
    );
  }
  if (byLineMessage) {
    return saveNonSuccessRow(
      csvImportId,
      rowNumber,
      raw,
      "SKIPPED",
      "DUPLICATE_LINE_MESSAGE_ID",
    );
  }

  const aiSnapshot: Prisma.InputJsonObject = {
    projectName: row.projectName,
    projectSummary: row.projectSummary,
    requiredSkills: row.requiredSkills,
    preferredSkills: row.preferredSkills,
    role: row.role,
    process: row.process,
    unitPriceMinMan: row.unitPriceMinMan,
    unitPriceMaxMan: row.unitPriceMaxMan,
    settlementRange: row.settlementRange,
    startMonth: row.startMonth,
    endMonth: row.endMonth,
    workDaysPerWeek: row.workDaysPerWeek,
    location: row.location,
    nearestStation: row.nearestStation,
    remoteStyle: row.remoteStyle,
    remoteNote: row.remoteNote,
    recruitmentCount: row.recruitmentCount,
    commercialFlow: row.commercialFlow,
    interviewCount: row.interviewCount,
    foreignerAllowed: row.foreignerAllowed,
    ageLimit: row.ageLimit,
    nationalityNote: row.nationalityNote,
    employmentCondition: row.employmentCondition,
    warningCodes: row.warningCodes,
    promptVersion: row.promptVersion,
  };

  try {
    await prisma.$transaction(async (transaction) => {
      const intake = await transaction.projectIntake.create({
        data: {
          receptionId: row.receptionId,
          lineMessageId: row.lineMessageId,
          aiSnapshot,
          projectName: row.projectName,
          projectSummary: row.projectSummary,
          requiredSkills: row.requiredSkills,
          preferredSkills: row.preferredSkills,
          role: row.role,
          process: row.process,
          unitPriceMinMan: row.unitPriceMinMan,
          unitPriceMaxMan: row.unitPriceMaxMan,
          settlementRange: row.settlementRange,
          startMonth: monthToUtcDate(row.startMonth),
          endMonth: monthToUtcDate(row.endMonth),
          workDaysPerWeek: row.workDaysPerWeek,
          location: row.location,
          nearestStation: row.nearestStation,
          remoteStyle: row.remoteStyle,
          remoteNote: row.remoteNote,
          recruitmentCount: row.recruitmentCount,
          commercialFlow: row.commercialFlow,
          interviewCount: row.interviewCount,
          foreignerAllowed: row.foreignerAllowed,
          ageLimit: row.ageLimit,
          nationalityNote: row.nationalityNote,
          employmentCondition: row.employmentCondition,
          warningCodes: row.warningCodes,
          promptVersion: row.promptVersion,
          receivedAt: new Date(row.receivedAt),
        },
      });
      await transaction.projectSource.create({
        data: {
          projectIntakeId: intake.id,
          receptionId: row.receptionId,
          lineMessageId: row.lineMessageId,
          lineUserId: row.lineUserId,
          lineGroupId: row.lineGroupId,
          sourceCompany: row.sourceCompany,
          sourceContact: row.sourceContact,
          rawText: row.rawText,
          receivedAt: new Date(row.receivedAt),
        },
      });
      await transaction.csvImportRow.create({
        data: {
          csvImportId,
          rowNumber,
          receptionId: row.receptionId,
          lineMessageId: row.lineMessageId,
          status: "SUCCESS",
          projectIntakeId: intake.id,
          rawData: rawJson(raw),
        },
      });
    });
    return "SUCCESS";
  } catch (error) {
    if (!isP2002(error)) throw error;
    const target = p2002Target(error);
    if (/reception_?id/i.test(target)) {
      return saveNonSuccessRow(
        csvImportId,
        rowNumber,
        raw,
        "SKIPPED",
        "DUPLICATE_RECEPTION_ID",
      );
    }
    if (/line_?message_?id/i.test(target)) {
      return saveNonSuccessRow(
        csvImportId,
        rowNumber,
        raw,
        "SKIPPED",
        "DUPLICATE_LINE_MESSAGE_ID",
      );
    }
    return saveNonSuccessRow(
      csvImportId,
      rowNumber,
      raw,
      "ERROR",
      "VALIDATION_ERROR",
    );
  }
}
