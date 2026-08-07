import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  CSV_HEADERS,
  FILE_NAME_PATTERN,
  GAS_TARGET_MAX_BYTES,
  MAX_CSV_ROWS,
} from "@/lib/csv/csv-contract";

type BatchRow = {
  promptVersion: string;
  receivedAt: string;
  csvValues: string[];
};

type BatchServiceModule = {
  buildBatchId(now: Date, randomSuffix: string): string;
  buildCsvFileName(schemaVersion: string, batchId: string): string;
  splitRowsIntoBatches(
    rows: BatchRow[],
    maximumRows?: number,
    maximumBytes?: number,
  ): Array<{ promptVersion: string; rows: BatchRow[] }>;
  buildCsvContent(rows: string[][]): string;
  utf8ByteLength(text: string): number;
};

const csvWriterSource = readFileSync(
  path.resolve(process.cwd(), "gas/CsvWriter.gs"),
  "utf8",
);
const batchServiceSource = readFileSync(
  path.resolve(process.cwd(), "gas/BatchService.gs"),
  "utf8",
);
const loadBatchService = new Function(
  `${csvWriterSource}\n${batchServiceSource}\nreturn { buildBatchId, buildCsvFileName, splitRowsIntoBatches, buildCsvContent, utf8ByteLength };`,
) as () => BatchServiceModule;
const batch = loadBatchService();

function row(index: number, options: Partial<BatchRow> = {}): BatchRow {
  const values = Array.from({ length: CSV_HEADERS.length }, () => "");
  const receivedAt =
    options.receivedAt ??
    `2026-08-07T10:${String(index % 60).padStart(2, "0")}:00.000+09:00`;
  const promptVersion = options.promptVersion ?? "PROJECT-PARSER-1";
  values[0] = `RCP-${index}`;
  values[1] = `MESSAGE-${index}`;
  values[29] = receivedAt;
  values[30] = options.csvValues?.[30] ?? "案件原文";
  values[32] = promptVersion;
  return { promptVersion, receivedAt, csvValues: values };
}

describe("C. GAS batch ID", () => {
  it("creates BATCH-YYYYMMDD-HHMMSS-XXXXXX in JST", () => {
    expect(
      batch.buildBatchId(new Date("2026-08-06T15:20:30.000Z"), "a1b2c3"),
    ).toBe("BATCH-20260807-002030-A1B2C3");
  });

  it("is independent of process.env.TZ", () => {
    const previous = process.env.TZ;
    process.env.TZ = "UTC";
    try {
      expect(
        batch.buildBatchId(new Date("2026-12-31T15:00:00.000Z"), "ABC123"),
      ).toBe("BATCH-20270101-000000-ABC123");
    } finally {
      process.env.TZ = previous;
    }
  });

  it("requires a six-character uppercase alphanumeric suffix", () => {
    const id = batch.buildBatchId(
      new Date("2026-08-07T00:00:00.000Z"),
      "ab12z9",
    );
    expect(id.split("-").at(-1)).toMatch(/^[A-Z0-9]{6}$/);
    expect(() => batch.buildBatchId(new Date(), "SHORT")).toThrow(
      "INVALID_BATCH_SUFFIX",
    );
  });

  it("creates a filename matching the canonical FILE_NAME_PATTERN", () => {
    const id = batch.buildBatchId(
      new Date("2026-08-07T00:00:00.000Z"),
      "ABC123",
    );
    expect(batch.buildCsvFileName("v1", id)).toMatch(FILE_NAME_PATTERN);
  });

  it("accepts time and randomness as arguments without generating them internally", () => {
    expect(batchServiceSource).not.toContain("new Date(");
    expect(batchServiceSource).not.toContain("Math.random(");
    expect(batch.buildBatchId(new Date(0), "000000")).toBe(
      "BATCH-19700101-090000-000000",
    );
  });
});

describe("D. GAS batch splitting", () => {
  it("keeps 1,000 small rows in one batch", () => {
    const result = batch.splitRowsIntoBatches(
      Array.from({ length: MAX_CSV_ROWS }, (_, index) => row(index)),
    );
    expect(result).toHaveLength(1);
    expect(result[0].rows).toHaveLength(1_000);
  });

  it("splits 1,001 rows into two batches", () => {
    const result = batch.splitRowsIntoBatches(
      Array.from({ length: MAX_CSV_ROWS + 1 }, (_, index) => row(index)),
    );
    expect(result.map((item) => item.rows.length)).toEqual([1_000, 1]);
  });

  it("splits before a CSV exceeds the 9 MiB UTF-8 target", () => {
    const japaneseRawText = "案".repeat(50_000);
    const rows = Array.from({ length: 70 }, (_, index) => {
      const values = Array.from({ length: CSV_HEADERS.length }, () => "");
      values[30] = japaneseRawText;
      return row(index, { csvValues: values });
    });
    const result = batch.splitRowsIntoBatches(rows);
    expect(result.length).toBeGreaterThan(1);
    result.forEach((item) => {
      const size = batch.utf8ByteLength(
        batch.buildCsvContent(item.rows.map((entry) => entry.csvValues)),
      );
      expect(size).toBeLessThanOrEqual(GAS_TARGET_MAX_BYTES);
    });
  });

  it("separates different prompt_version values", () => {
    const result = batch.splitRowsIntoBatches([
      row(1, { promptVersion: "PROJECT-PARSER-1" }),
      row(2, { promptVersion: "PROJECT-PARSER-2" }),
    ]);
    expect(result.map((item) => item.promptVersion)).toEqual([
      "PROJECT-PARSER-1",
      "PROJECT-PARSER-2",
    ]);
  });

  it("sorts rows by received_at ascending", () => {
    const result = batch.splitRowsIntoBatches([
      row(2, { receivedAt: "2026-08-07T12:00:00.000+09:00" }),
      row(1, { receivedAt: "2026-08-07T10:00:00.000+09:00" }),
    ]);
    expect(result[0].rows.map((item) => item.receivedAt)).toEqual([
      "2026-08-07T10:00:00.000+09:00",
      "2026-08-07T12:00:00.000+09:00",
    ]);
  });

  it("returns an empty result for zero rows", () => {
    expect(batch.splitRowsIntoBatches([])).toEqual([]);
  });
});

describe("E. BatchService purity", () => {
  it.each(["SpreadsheetApp", "DriveApp", "LockService", "Utilities", "Logger"])(
    "does not reference GAS API %s",
    (api) => {
      expect(batchServiceSource).not.toContain(api);
    },
  );
});
