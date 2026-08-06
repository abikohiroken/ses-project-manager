import type { FileErrorCode, RowErrorCode } from "@/lib/csv/csv-contract";

export type ImportFileReasonCode =
  | FileErrorCode
  | "FILE_DUPLICATE"
  | "ALL_ROWS_SKIPPED"
  | "BATCH_ALREADY_IMPORTED";

const ERROR_MESSAGES: Record<FileErrorCode | RowErrorCode, string> = {
  INVALID_FILE_NAME: "ファイル名が規定形式ではありません。",
  UNSUPPORTED_SCHEMA_VERSION: "対応していないCSVスキーマです。",
  EMPTY_FILE: "CSVにデータ行がありません。",
  FILE_TOO_LARGE: "CSVファイルが上限サイズを超えています。",
  INVALID_UTF8_BOM: "UTF-8 BOMがありません。",
  HEADER_MISMATCH: "CSVヘッダーが規定と一致しません。",
  DUPLICATE_HEADER: "CSVヘッダーが重複しています。",
  ROW_LIMIT_EXCEEDED: "CSVのデータ行が上限を超えています。",
  CSV_PARSE_ERROR: "CSVの構文を解析できません。",
  MIXED_PROMPT_VERSION: "複数のprompt_versionが混在しています。",
  DRIVE_DOWNLOAD_FAILED: "Driveからファイルを取得できませんでした。",
  DRIVE_MOVE_FAILED: "Drive上のファイルを移動できませんでした。",
  REQUIRED_RECEPTION_ID: "reception_idは必須です。",
  REQUIRED_LINE_MESSAGE_ID: "line_message_idは必須です。",
  REQUIRED_RECEIVED_AT: "received_atは必須です。",
  REQUIRED_RAW_TEXT: "raw_textは必須です。",
  REQUIRED_PROMPT_VERSION: "prompt_versionは必須です。",
  INVALID_JSON_ARRAY: "JSON文字列配列が不正です。",
  INVALID_INTEGER: "整数項目が不正です。",
  INVALID_MONTH: "年月が不正です。",
  INVALID_DATETIME: "日時が不正です。",
  INVALID_REMOTE_STYLE: "remote_styleが定義値ではありません。",
  INVALID_FOREIGNER_ALLOWED: "foreigner_allowedが定義値ではありません。",
  RAW_TEXT_TOO_LONG: "raw_textが上限を超えています。",
  DUPLICATE_ID_IN_FILE: "同一CSV内で識別子が重複しています。",
  DUPLICATE_RECEPTION_ID: "reception_idは登録済みです。",
  DUPLICATE_LINE_MESSAGE_ID: "line_message_idは登録済みです。",
  IDENTIFIER_CONFLICT: "2つの識別子が別々の案件を指しています。",
  VALIDATION_ERROR: "行の値が規定に適合しません。",
};

export class CsvFileError extends Error {
  constructor(readonly code: FileErrorCode) {
    super(ERROR_MESSAGES[code]);
    this.name = "CsvFileError";
  }
}

export class CsvRowError extends Error {
  constructor(readonly code: RowErrorCode, readonly rowNumber: number) {
    super(ERROR_MESSAGES[code]);
    this.name = "CsvRowError";
  }
}

export function importErrorMessage(code: FileErrorCode | RowErrorCode): string {
  return ERROR_MESSAGES[code];
}
