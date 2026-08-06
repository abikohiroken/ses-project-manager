import { parse } from "csv-parse/sync";

import {
  CSV_HEADERS,
  MAX_CSV_ROWS,
  type CsvHeader,
} from "@/lib/csv/csv-contract";
import { CsvFileError } from "@/lib/import/import-errors";

export type RawCsvRow = Record<CsvHeader, string>;

export type ParsedCsvFile = {
  rows: RawCsvRow[];
  promptVersion: string;
};

const UTF8_BOM = [0xef, 0xbb, 0xbf] as const;

function hasUtf8Bom(input: Uint8Array): boolean {
  return UTF8_BOM.every((byte, index) => input[index] === byte);
}

function validateHeaders(headers: string[]): void {
  const normalized = headers.map((header) => header.normalize("NFC"));
  if (new Set(normalized).size !== normalized.length) {
    throw new CsvFileError("DUPLICATE_HEADER");
  }
  if (
    normalized.length !== CSV_HEADERS.length ||
    normalized.some((header, index) => header !== CSV_HEADERS[index])
  ) {
    throw new CsvFileError("HEADER_MISMATCH");
  }
}

export function parseCsvFile(input: Uint8Array): ParsedCsvFile {
  if (!hasUtf8Bom(input)) throw new CsvFileError("INVALID_UTF8_BOM");

  // csv-parseはNULを許容するため、構文解析前にファイル全体を拒否する。
  if (input.includes(0)) throw new CsvFileError("CSV_PARSE_ERROR");

  let records: string[][];
  try {
    records = parse(Buffer.from(input), {
      bom: true,
      relax_column_count: false,
    }) as string[][];
  } catch {
    throw new CsvFileError("CSV_PARSE_ERROR");
  }

  const [headers, ...dataRows] = records;
  if (!headers) throw new CsvFileError("EMPTY_FILE");
  validateHeaders(headers);
  if (dataRows.length === 0) throw new CsvFileError("EMPTY_FILE");
  if (dataRows.length > MAX_CSV_ROWS) {
    throw new CsvFileError("ROW_LIMIT_EXCEEDED");
  }

  const rows = dataRows.map((values) =>
    Object.fromEntries(
      CSV_HEADERS.map((header, index) => [header, values[index] ?? ""]),
    ) as RawCsvRow,
  );
  const promptVersions = new Set(rows.map((row) => row.prompt_version));
  if (promptVersions.size !== 1) {
    throw new CsvFileError("MIXED_PROMPT_VERSION");
  }

  return { rows, promptVersion: rows[0].prompt_version };
}
