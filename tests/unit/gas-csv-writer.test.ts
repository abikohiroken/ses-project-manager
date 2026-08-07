import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { CSV_HEADERS } from "@/lib/csv/csv-contract";

type CsvWriterModule = {
  CSV_HEADERS: string[];
  escapeCsvCell(value: unknown): string;
  buildCsvRow(values: unknown[]): string;
  buildCsvHeader(): string;
  buildCsvContent(rows: unknown[][]): string;
  utf8ByteLength(text: string): number;
  csvByteLength(rows: unknown[][]): number;
};

const csvWriterSource = readFileSync(
  path.resolve(process.cwd(), "gas/CsvWriter.gs"),
  "utf8",
);
const loadCsvWriter = new Function(
  `${csvWriterSource}\nreturn { CSV_HEADERS, escapeCsvCell, buildCsvRow, buildCsvHeader, buildCsvContent, utf8ByteLength, csvByteLength };`,
) as () => CsvWriterModule;
const csv = loadCsvWriter();

describe("A. GAS CSV generation", () => {
  it("quotes every cell including an empty cell", () => {
    expect(csv.buildCsvRow(["value", ""])).toBe('"value",""');
  });

  it("escapes double quotes and preserves commas and embedded newlines", () => {
    expect(csv.escapeCsvCell('案件,"A"\r\n次行')).toBe('"案件,""A""\r\n次行"');
  });

  it("uses CRLF for every record boundary", () => {
    const content = csv.buildCsvContent([["one"], ["two"]]);
    expect(content).toBe(`\uFEFF${csv.buildCsvHeader()}\r\n"one"\r\n"two"\r\n`);
    expect(content.replaceAll("\r\n", "")).not.toContain("\n");
  });

  it("adds a UTF-8 BOM", () => {
    expect(csv.buildCsvContent([]).charCodeAt(0)).toBe(0xfeff);
  });

  it("matches the canonical 33 headers in exact order", () => {
    expect(csv.CSV_HEADERS).toEqual([...CSV_HEADERS]);
    expect(csv.buildCsvHeader()).toBe(
      CSV_HEADERS.map((header) => `"${header}"`).join(","),
    );
  });

  it("does not modify raw_text whitespace or line breaks", () => {
    const values = Array.from({ length: CSV_HEADERS.length }, () => "");
    const rawText = "  原文の前後空白\r\n次の行\n  ";
    values[30] = rawText;
    expect(csv.buildCsvRow(values)).toContain(`,"${rawText}",`);
  });

  it("serializes null and undefined as quoted empty strings", () => {
    expect(csv.buildCsvRow([null, undefined])).toBe('"",""');
  });
});

describe("B. GAS UTF-8 byte length", () => {
  it("counts ASCII as one byte per character", () => {
    expect(csv.utf8ByteLength("Java")).toBe(4);
  });

  it("counts Japanese characters as three bytes", () => {
    expect(csv.utf8ByteLength("案件名")).toBe(9);
  });

  it("counts an emoji surrogate pair as four bytes", () => {
    expect(csv.utf8ByteLength("😀")).toBe(4);
  });

  it("explicitly differs from String.length for multibyte text", () => {
    expect("案件名".length).toBe(3);
    expect(csv.utf8ByteLength("案件名")).not.toBe("案件名".length);
  });

  it("counts the BOM as three bytes", () => {
    expect(csv.utf8ByteLength("\uFEFF")).toBe(3);
  });

  it("counts each CRLF as two bytes in the complete CSV", () => {
    const rows = [["A"], ["B"]];
    const expected =
      3 +
      csv.utf8ByteLength(csv.buildCsvHeader()) +
      2 +
      csv.utf8ByteLength('"A"') +
      2 +
      csv.utf8ByteLength('"B"') +
      2;
    expect(csv.csvByteLength(rows)).toBe(expected);
  });
});

describe("E. CsvWriter purity", () => {
  it.each(["SpreadsheetApp", "DriveApp", "LockService", "Utilities", "Logger"])(
    "does not reference GAS API %s",
    (api) => {
      expect(csvWriterSource).not.toContain(api);
    },
  );
});
