import { describe, expect, it } from "vitest";

import {
  CSV_HEADERS,
  type CsvHeader,
} from "@/lib/csv/csv-contract";
import { monthToUtcDate, normalizeCsvRow } from "@/lib/csv/csv-normalizer";
import { parseCsvFile, type RawCsvRow } from "@/lib/csv/csv-parser";

function baseRow(overrides: Partial<RawCsvRow> = {}): RawCsvRow {
  return {
    reception_id: "RCP-001",
    line_message_id: "LINE-001",
    line_user_id: "USER-001",
    line_group_id: "",
    project_name: "案件A",
    project_summary: "概要",
    required_skills: '["Java"," SQL ","Java",""]',
    preferred_skills: "[]",
    role: "SE",
    process: "設計",
    unit_price_min_man: "60",
    unit_price_max_man: "70",
    settlement_range: "140-180h",
    start_month: "2026-09",
    end_month: "2026-12",
    work_days_per_week: "5",
    location: "東京",
    nearest_station: "東京駅",
    remote_style: "hybrid",
    remote_note: "週2出社",
    recruitment_count: "1",
    commercial_flow: "元請",
    interview_count: "1",
    foreigner_allowed: "conditional",
    age_limit: "50歳まで",
    nationality_note: "日本語N1",
    employment_condition: "業務委託",
    source_company: "取引先",
    source_contact: "担当者",
    received_at: "2026-08-06T14:20:30+09:00",
    raw_text: "原文",
    warning_codes: '["PRICE_AMBIGUOUS"]',
    prompt_version: "PROJECT-PARSER-1",
    ...overrides,
  };
}

function csvBytes(
  rows: RawCsvRow[],
  headers: readonly string[] = CSV_HEADERS,
  bom = true,
): Uint8Array {
  const quote = (value: string) => `"${value.replaceAll('"', '""')}"`;
  const lines = [
    headers.map(quote).join(","),
    ...rows.map((row) => headers.map((header) => quote(row[header as CsvHeader] ?? "")).join(",")),
  ];
  return Buffer.from(`${bom ? "\ufeff" : ""}${lines.join("\r\n")}`, "utf8");
}

function expectRowError(overrides: Partial<RawCsvRow>, code: string) {
  expect(() => normalizeCsvRow(baseRow(overrides), 1)).toThrowError(
    expect.objectContaining({ code }),
  );
}

describe("A. CSVパーサー", () => {
  it("1. BOM付き33列CSVをパースできる", () => {
    expect(parseCsvFile(csvBytes([baseRow()])).rows).toHaveLength(1);
  });

  it("2. BOMなしを拒否する", () => {
    expect(() => parseCsvFile(csvBytes([baseRow()], CSV_HEADERS, false))).toThrowError(
      expect.objectContaining({ code: "INVALID_UTF8_BOM" }),
    );
  });

  it("3. 不完全な引用符をCSV_PARSE_ERRORにする", () => {
    const input = Buffer.from(`\ufeff${CSV_HEADERS.join(",")}\r\n"unterminated`, "utf8");
    expect(() => parseCsvFile(input)).toThrowError(
      expect.objectContaining({ code: "CSV_PARSE_ERROR" }),
    );
  });

  it("4. 列数不一致をCSV_PARSE_ERRORにする", () => {
    const input = Buffer.from(`\ufeff${CSV_HEADERS.join(",")}\r\nonly-one`, "utf8");
    expect(() => parseCsvFile(input)).toThrowError(
      expect.objectContaining({ code: "CSV_PARSE_ERROR" }),
    );
  });

  it("5. セル内改行・カンマ・引用符を保持する", () => {
    const rawText = '1行目,値\r\n2行目 "引用"';
    const parsed = parseCsvFile(csvBytes([baseRow({ raw_text: rawText })]));
    expect(parsed.rows[0].raw_text).toBe(rawText);
  });

  it("6. NUL文字をファイル単位で拒否する", () => {
    expect(() => parseCsvFile(csvBytes([baseRow({ raw_text: "a\0b" })]))).toThrowError(
      expect.objectContaining({ code: "CSV_PARSE_ERROR" }),
    );
  });

  it("7. ヘッダー順序違いを拒否する", () => {
    const headers: string[] = [...CSV_HEADERS];
    [headers[0], headers[1]] = [headers[1], headers[0]];
    expect(() => parseCsvFile(csvBytes([baseRow()], headers))).toThrowError(
      expect.objectContaining({ code: "HEADER_MISMATCH" }),
    );
  });

  it("8. 重複ヘッダーを拒否する", () => {
    const headers: string[] = [...CSV_HEADERS];
    headers[1] = headers[0];
    expect(() => parseCsvFile(csvBytes([baseRow()], headers))).toThrowError(
      expect.objectContaining({ code: "DUPLICATE_HEADER" }),
    );
  });

  it("9. 不明列を拒否する", () => {
    const headers: string[] = [...CSV_HEADERS];
    headers[0] = "unknown_header";
    expect(() => parseCsvFile(csvBytes([baseRow()], headers))).toThrowError(
      expect.objectContaining({ code: "HEADER_MISMATCH" }),
    );
  });

  it("10. キリル文字を混ぜた偽ヘッダーを拒否する", () => {
    const headers: string[] = [...CSV_HEADERS];
    headers[0] = "receptiоn_id";
    expect(() => parseCsvFile(csvBytes([baseRow()], headers))).toThrowError(
      expect.objectContaining({ code: "HEADER_MISMATCH" }),
    );
  });

  it("11. 0行と1,001行を拒否する", () => {
    expect(() => parseCsvFile(csvBytes([]))).toThrowError(
      expect.objectContaining({ code: "EMPTY_FILE" }),
    );
    const rows = Array.from({ length: 1_001 }, (_, index) =>
      baseRow({ reception_id: `RCP-${index}`, line_message_id: `LINE-${index}` }),
    );
    expect(() => parseCsvFile(csvBytes(rows))).toThrowError(
      expect.objectContaining({ code: "ROW_LIMIT_EXCEEDED" }),
    );
  });

  it("12. prompt_version混在を拒否する", () => {
    const rows = [baseRow(), baseRow({ prompt_version: "PROJECT-PARSER-2" })];
    expect(() => parseCsvFile(csvBytes(rows))).toThrowError(
      expect.objectContaining({ code: "MIXED_PROMPT_VERSION" }),
    );
  });
});

describe("B. 正規化・行バリデーション", () => {
  it("13. 任意項目の空文字をNULLへ変換する", () => {
    const row = normalizeCsvRow(
      baseRow({ project_name: "", unit_price_min_man: "", start_month: "" }),
      1,
    );
    expect(row).toMatchObject({ projectName: null, unitPriceMinMan: null, startMonth: null });
  });

  it.each([
    ["reception_id", "REQUIRED_RECEPTION_ID"],
    ["line_message_id", "REQUIRED_LINE_MESSAGE_ID"],
    ["required_skills", "INVALID_JSON_ARRAY"],
    ["preferred_skills", "INVALID_JSON_ARRAY"],
    ["received_at", "REQUIRED_RECEIVED_AT"],
    ["raw_text", "REQUIRED_RAW_TEXT"],
    ["warning_codes", "INVALID_JSON_ARRAY"],
    ["prompt_version", "REQUIRED_PROMPT_VERSION"],
  ] as const)("14. 必須項目%sの空文字を行エラーにする", (field, code) => {
    expectRowError({ [field]: "" }, code);
  });

  it("15. JSON配列を検証・空白除去・重複除去し順序を保つ", () => {
    expect(normalizeCsvRow(baseRow(), 1).requiredSkills).toEqual(["Java", "SQL"]);
    expectRowError({ required_skills: "{}" }, "INVALID_JSON_ARRAY");
    expectRowError({ required_skills: '["Java",1]' }, "INVALID_JSON_ARRAY");
  });

  it("16. 小数単価を拒否する", () => {
    expectRowError({ unit_price_min_man: "60.5" }, "INVALID_INTEGER");
  });

  it("17. 単価下限が上限を超える値を拒否する", () => {
    expectRowError(
      { unit_price_min_man: "80", unit_price_max_man: "70" },
      "VALIDATION_ERROR",
    );
  });

  it("18. work_days_per_week=8を拒否する", () => {
    expectRowError({ work_days_per_week: "8" }, "VALIDATION_ERROR");
  });

  it("19. raw_text 50,001文字を拒否する", () => {
    expectRowError({ raw_text: "x".repeat(50_001) }, "RAW_TEXT_TOO_LONG");
  });

  it("20. remote_styleとforeigner_allowedの定義外値を拒否する", () => {
    expectRowError({ remote_style: "remote" }, "INVALID_REMOTE_STYLE");
    expectRowError({ foreigner_allowed: "yes" }, "INVALID_FOREIGNER_ALLOWED");
  });

  it("21. YYYY-MMをUTCの月初Dateへ変換する", () => {
    expect(monthToUtcDate("2026-09")?.toISOString()).toBe("2026-09-01T00:00:00.000Z");
  });

  it("22. タイムゾーンなしreceived_atを拒否する", () => {
    expectRowError({ received_at: "2026-08-06T14:20:30" }, "INVALID_DATETIME");
  });

  it("23. 業務項目不足をエラーにせず正規化する", () => {
    expect(() =>
      normalizeCsvRow(
        baseRow({
          project_name: "",
          unit_price_min_man: "",
          unit_price_max_man: "",
          start_month: "",
          required_skills: "[]",
          location: "",
        }),
        1,
      ),
    ).not.toThrow();
  });
});
