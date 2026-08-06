import { z } from "zod";

import {
  FOREIGNER_ALLOWED_VALUES,
  MAX_RAW_TEXT_LENGTH,
  REMOTE_STYLES,
  WARNING_CODES,
  type ForeignerAllowed,
  type ParsedCsvRow,
  type RemoteStyle,
  type WarningCode,
} from "@/lib/csv/csv-contract";
import type { RawCsvRow } from "@/lib/csv/csv-parser";
import { CsvRowError } from "@/lib/import/import-errors";

const timestampSchema = z.string().datetime({ offset: true });
const monthPattern = /^\d{4}-(0[1-9]|1[0-2])$/;

function required(
  value: string,
  code:
    | "REQUIRED_RECEPTION_ID"
    | "REQUIRED_LINE_MESSAGE_ID"
    | "REQUIRED_RECEIVED_AT"
    | "REQUIRED_RAW_TEXT"
    | "REQUIRED_PROMPT_VERSION",
  rowNumber: number,
): string {
  if (value === "") throw new CsvRowError(code, rowNumber);
  return value;
}

function optionalText(value: string, max: number | null, rowNumber: number): string | null {
  const normalized = value.trim();
  if (normalized === "") return null;
  if (max !== null && normalized.length > max) {
    throw new CsvRowError("VALIDATION_ERROR", rowNumber);
  }
  return normalized;
}

function integerValue(
  value: string,
  rowNumber: number,
  minimum: number,
  maximum?: number,
): number | null {
  if (value === "") return null;
  if (!/^\d+$/.test(value)) throw new CsvRowError("INVALID_INTEGER", rowNumber);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw new CsvRowError("INVALID_INTEGER", rowNumber);
  if (parsed < minimum || (maximum !== undefined && parsed > maximum)) {
    throw new CsvRowError("VALIDATION_ERROR", rowNumber);
  }
  return parsed;
}

function monthValue(value: string, rowNumber: number): string | null {
  if (value === "") return null;
  if (!monthPattern.test(value)) throw new CsvRowError("INVALID_MONTH", rowNumber);
  return value;
}

function jsonStringArray(value: string, rowNumber: number): string[] {
  if (value === "") throw new CsvRowError("INVALID_JSON_ARRAY", rowNumber);
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new CsvRowError("INVALID_JSON_ARRAY", rowNumber);
  }
  if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== "string")) {
    throw new CsvRowError("INVALID_JSON_ARRAY", rowNumber);
  }
  return [...new Set(parsed.map((item) => item.trim()).filter(Boolean))];
}

function warningCodes(value: string, rowNumber: number): WarningCode[] {
  const values = jsonStringArray(value, rowNumber);
  if (values.some((value) => !WARNING_CODES.includes(value as WarningCode))) {
    throw new CsvRowError("VALIDATION_ERROR", rowNumber);
  }
  return values as WarningCode[];
}

function remoteStyle(value: string, rowNumber: number): RemoteStyle | null {
  if (value === "") return null;
  if (!REMOTE_STYLES.includes(value as RemoteStyle)) {
    throw new CsvRowError("INVALID_REMOTE_STYLE", rowNumber);
  }
  return value as RemoteStyle;
}

function foreignerAllowed(value: string, rowNumber: number): ForeignerAllowed | null {
  if (value === "") return null;
  if (!FOREIGNER_ALLOWED_VALUES.includes(value as ForeignerAllowed)) {
    throw new CsvRowError("INVALID_FOREIGNER_ALLOWED", rowNumber);
  }
  return value as ForeignerAllowed;
}

export function monthToUtcDate(value: string | null): Date | null {
  if (value === null) return null;
  const [year, month] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, 1));
}

export function normalizeCsvRow(raw: RawCsvRow, rowNumber: number): ParsedCsvRow {
  const receptionId = required(raw.reception_id, "REQUIRED_RECEPTION_ID", rowNumber);
  const lineMessageId = required(
    raw.line_message_id,
    "REQUIRED_LINE_MESSAGE_ID",
    rowNumber,
  );
  const receivedAt = required(raw.received_at, "REQUIRED_RECEIVED_AT", rowNumber);
  const rawText = required(raw.raw_text, "REQUIRED_RAW_TEXT", rowNumber);
  const promptVersion = required(
    raw.prompt_version,
    "REQUIRED_PROMPT_VERSION",
    rowNumber,
  );
  if (receptionId.length > 64 || lineMessageId.length > 128 || promptVersion.length > 64) {
    throw new CsvRowError("VALIDATION_ERROR", rowNumber);
  }
  if (rawText.length > MAX_RAW_TEXT_LENGTH) {
    throw new CsvRowError("RAW_TEXT_TOO_LONG", rowNumber);
  }
  if (!timestampSchema.safeParse(receivedAt).success) {
    throw new CsvRowError("INVALID_DATETIME", rowNumber);
  }

  const startMonth = monthValue(raw.start_month, rowNumber);
  const endMonth = monthValue(raw.end_month, rowNumber);
  if (startMonth !== null && endMonth !== null && startMonth > endMonth) {
    throw new CsvRowError("VALIDATION_ERROR", rowNumber);
  }

  const unitPriceMinMan = integerValue(raw.unit_price_min_man, rowNumber, 0);
  const unitPriceMaxMan = integerValue(raw.unit_price_max_man, rowNumber, 0);
  if (
    unitPriceMinMan !== null &&
    unitPriceMaxMan !== null &&
    unitPriceMinMan > unitPriceMaxMan
  ) {
    throw new CsvRowError("VALIDATION_ERROR", rowNumber);
  }

  return {
    receptionId,
    lineMessageId,
    lineUserId: optionalText(raw.line_user_id, 128, rowNumber),
    lineGroupId: optionalText(raw.line_group_id, 128, rowNumber),
    projectName: optionalText(raw.project_name, 255, rowNumber),
    projectSummary: optionalText(raw.project_summary, null, rowNumber),
    requiredSkills: jsonStringArray(raw.required_skills, rowNumber),
    preferredSkills: jsonStringArray(raw.preferred_skills, rowNumber),
    role: optionalText(raw.role, 100, rowNumber),
    process: optionalText(raw.process, 255, rowNumber),
    unitPriceMinMan,
    unitPriceMaxMan,
    settlementRange: optionalText(raw.settlement_range, 100, rowNumber),
    startMonth,
    endMonth,
    workDaysPerWeek: integerValue(raw.work_days_per_week, rowNumber, 1, 7),
    location: optionalText(raw.location, 255, rowNumber),
    nearestStation: optionalText(raw.nearest_station, 255, rowNumber),
    remoteStyle: remoteStyle(raw.remote_style, rowNumber),
    remoteNote: optionalText(raw.remote_note, null, rowNumber),
    recruitmentCount: integerValue(raw.recruitment_count, rowNumber, 1),
    commercialFlow: optionalText(raw.commercial_flow, null, rowNumber),
    interviewCount: integerValue(raw.interview_count, rowNumber, 0),
    foreignerAllowed: foreignerAllowed(raw.foreigner_allowed, rowNumber),
    ageLimit: optionalText(raw.age_limit, 100, rowNumber),
    nationalityNote: optionalText(raw.nationality_note, null, rowNumber),
    employmentCondition: optionalText(raw.employment_condition, null, rowNumber),
    sourceCompany: optionalText(raw.source_company, 255, rowNumber),
    sourceContact: optionalText(raw.source_contact, 100, rowNumber),
    receivedAt,
    rawText,
    warningCodes: warningCodes(raw.warning_codes, rowNumber),
    promptVersion,
  };
}
