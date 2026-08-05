/**
 * SES案件CSV / Google Drive取込 契約定義
 * 詳細設計書 v1.0に対応。
 *
 * このファイルは依存ライブラリを持たない契約定義であり、
 * 実装時はcsv-parse等のRFC 4180対応パーサーとZod等の
 * バリデーションライブラリを組み合わせる。
 */

export const CSV_SCHEMA_VERSION = "v1" as const;
export const MAX_CSV_ROWS = 1_000;
export const MAX_CSV_BYTES = 10 * 1024 * 1024;
export const GAS_TARGET_MAX_BYTES = 9 * 1024 * 1024;
export const MAX_RAW_TEXT_LENGTH = 50_000;

export const CSV_HEADERS = [
  "reception_id",
  "line_message_id",
  "line_user_id",
  "line_group_id",
  "project_name",
  "project_summary",
  "required_skills",
  "preferred_skills",
  "role",
  "process",
  "unit_price_min_man",
  "unit_price_max_man",
  "settlement_range",
  "start_month",
  "end_month",
  "work_days_per_week",
  "location",
  "nearest_station",
  "remote_style",
  "remote_note",
  "recruitment_count",
  "commercial_flow",
  "interview_count",
  "foreigner_allowed",
  "age_limit",
  "nationality_note",
  "employment_condition",
  "source_company",
  "source_contact",
  "received_at",
  "raw_text",
  "warning_codes",
  "prompt_version",
] as const;

export type CsvHeader = (typeof CSV_HEADERS)[number];

export const FILE_NAME_PATTERN =
  /^ses_projects_(v[1-9][0-9]*)_(BATCH-\d{8}-\d{6}-[A-Z0-9]{6})\.csv$/;

export const REMOTE_STYLES = [
  "full",
  "hybrid",
  "onsite",
  "unknown",
] as const;

export const FOREIGNER_ALLOWED_VALUES = [
  "allowed",
  "not_allowed",
  "conditional",
  "unknown",
] as const;

export const WARNING_CODES = [
  "PROJECT_NAME_MISSING",
  "PRICE_AMBIGUOUS",
  "START_MONTH_AMBIGUOUS",
  "REQUIRED_SKILLS_MISSING",
  "MULTIPLE_LOCATIONS",
  "CONFLICTING_INFORMATION",
  "PROMPT_INJECTION_SUSPECTED",
] as const;

export type RemoteStyle = (typeof REMOTE_STYLES)[number];
export type ForeignerAllowed =
  (typeof FOREIGNER_ALLOWED_VALUES)[number];
export type WarningCode = (typeof WARNING_CODES)[number];

export interface ParsedCsvRow {
  receptionId: string;
  lineMessageId: string;
  lineUserId: string | null;
  lineGroupId: string | null;
  projectName: string | null;
  projectSummary: string | null;
  requiredSkills: string[];
  preferredSkills: string[];
  role: string | null;
  process: string | null;
  unitPriceMinMan: number | null;
  unitPriceMaxMan: number | null;
  settlementRange: string | null;
  startMonth: string | null; // YYYY-MM
  endMonth: string | null; // YYYY-MM
  workDaysPerWeek: number | null;
  location: string | null;
  nearestStation: string | null;
  remoteStyle: RemoteStyle | null;
  remoteNote: string | null;
  recruitmentCount: number | null;
  commercialFlow: string | null;
  interviewCount: number | null;
  foreignerAllowed: ForeignerAllowed | null;
  ageLimit: string | null;
  nationalityNote: string | null;
  employmentCondition: string | null;
  sourceCompany: string | null;
  sourceContact: string | null;
  receivedAt: string; // ISO 8601 with timezone
  rawText: string;
  warningCodes: WarningCode[];
  promptVersion: string;
}

export type FileErrorCode =
  | "INVALID_FILE_NAME"
  | "UNSUPPORTED_SCHEMA_VERSION"
  | "EMPTY_FILE"
  | "FILE_TOO_LARGE"
  | "INVALID_UTF8_BOM"
  | "HEADER_MISMATCH"
  | "DUPLICATE_HEADER"
  | "ROW_LIMIT_EXCEEDED"
  | "CSV_PARSE_ERROR"
  | "MIXED_PROMPT_VERSION"
  | "DRIVE_DOWNLOAD_FAILED"
  | "DRIVE_MOVE_FAILED";

export type RowErrorCode =
  | "REQUIRED_RECEPTION_ID"
  | "REQUIRED_LINE_MESSAGE_ID"
  | "REQUIRED_RECEIVED_AT"
  | "REQUIRED_RAW_TEXT"
  | "REQUIRED_PROMPT_VERSION"
  | "INVALID_JSON_ARRAY"
  | "INVALID_INTEGER"
  | "INVALID_MONTH"
  | "INVALID_DATETIME"
  | "INVALID_REMOTE_STYLE"
  | "INVALID_FOREIGNER_ALLOWED"
  | "RAW_TEXT_TOO_LONG"
  | "DUPLICATE_ID_IN_FILE"
  | "DUPLICATE_RECEPTION_ID"
  | "DUPLICATE_LINE_MESSAGE_ID"
  | "IDENTIFIER_CONFLICT"
  | "VALIDATION_ERROR";

export interface ImportRunResult {
  checkedAt: string;
  listedFiles: number;
  processedFiles: number;
  successFiles: number;
  partialSuccessFiles: number;
  errorFiles: number;
  skippedFiles: number;
  movePendingFiles: number;
}
