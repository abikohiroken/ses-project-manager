import { afterEach, describe, expect, it } from "vitest";

import { displayValue, formatJstDateTime, formatMonth, formatPrice } from "@/lib/format/display";
import { safeHttpHref, tokenizeRawText } from "@/lib/format/raw-text";
import { isAiValueChanged } from "@/lib/ui/ai-diff";
import { csvDisplayKind } from "@/lib/ui/csv-display";
import { capabilitiesForRole } from "@/lib/ui/permissions";
import { projectActionsForStatus } from "@/lib/ui/project-actions";

const originalTimezone = process.env.TZ;

afterEach(() => {
  process.env.TZ = originalTimezone;
});

describe("A. 表示整形", () => {
  it("日時をJSTのYYYY/MM/DD HH:mmで表示する", () => {
    expect(formatJstDateTime("2026-08-06T14:20:30+09:00")).toBe("2026/08/06 14:20");
  });

  it("TZ=UTCでも日時表示が変わらない", () => {
    process.env.TZ = "UTC";
    expect(formatJstDateTime("2026-08-06T14:20:30+09:00")).toBe("2026/08/06 14:20");
  });

  it("月をYYYY/MMで表示する", () => {
    expect(formatMonth("2026-09")).toBe("2026/09");
  });

  it("単価の上下限を4形式で表示する", () => {
    expect(formatPrice(60, 70)).toBe("60〜70万円");
    expect(formatPrice(60, null)).toBe("60万円〜");
    expect(formatPrice(null, 70)).toBe("〜70万円");
    expect(formatPrice(null, null)).toBe("—");
  });

  it("空値・null・空文字をダッシュで表示する", () => {
    expect(displayValue(undefined)).toBe("—");
    expect(displayValue(null)).toBe("—");
    expect(displayValue("")).toBe("—");
  });
});

describe("B. 原文のURLリンク化", () => {
  it("http URLだけをリンクとして抽出する", () => {
    expect(tokenizeRawText("参照 http://example.com")).toContainEqual({
      kind: "link",
      text: "http://example.com",
      href: "http://example.com",
    });
  });

  it("https URLだけをリンクとして抽出する", () => {
    expect(tokenizeRawText("参照 https://example.com")).toContainEqual({
      kind: "link",
      text: "https://example.com",
      href: "https://example.com",
    });
  });

  it.each(["javascript:alert(1)", "data:text/html,<script>", "vbscript:msgbox(1)"])(
    "%sをリンクにしない",
    (value) => {
      expect(safeHttpHref(value)).toBeNull();
      expect(tokenizeRawText(value)).toEqual([{ kind: "text", text: value }]);
    },
  );

  it("HTMLタグを文字列のまま保持する", () => {
    const raw = "<script>alert(1)</script>";
    expect(tokenizeRawText(raw)).toEqual([{ kind: "text", text: raw }]);
  });

  it("改行を文字列のまま保持する", () => {
    const raw = "1行目\n2行目";
    expect(tokenizeRawText(raw).map((segment) => segment.text).join("")).toBe(raw);
  });
});

describe("C. 権限による出し分け", () => {
  it("VIEWERは更新系操作もユーザー管理も不可", () => {
    expect(capabilitiesForRole("VIEWER")).toEqual({
      canEditProjects: false,
      canManageUsers: false,
    });
  });

  it("OPERATORは案件操作可能でユーザー管理不可", () => {
    expect(capabilitiesForRole("OPERATOR")).toEqual({
      canEditProjects: true,
      canManageUsers: false,
    });
  });

  it("ADMINはすべて操作可能", () => {
    expect(capabilitiesForRole("ADMIN")).toEqual({
      canEditProjects: true,
      canManageUsers: true,
    });
  });
});

describe("D. 状態別の操作可否", () => {
  it("OPENでは保留・募集終了・アーカイブが選べる", () => {
    expect(projectActionsForStatus("OPEN").map(({ action }) => action)).toEqual([
      "hold",
      "close",
      "archive",
    ]);
  });

  it("ON_HOLDでは再開・アーカイブが選べる", () => {
    expect(projectActionsForStatus("ON_HOLD").map(({ action }) => action)).toEqual([
      "open",
      "archive",
    ]);
  });

  it("CLOSEDでは再募集・アーカイブが選べる", () => {
    expect(projectActionsForStatus("CLOSED").map(({ action }) => action)).toEqual([
      "open",
      "archive",
    ]);
  });

  it("ARCHIVEDでは操作を返さない", () => {
    expect(projectActionsForStatus("ARCHIVED")).toEqual([]);
  });
});

describe("E. AI初期値との差分判定", () => {
  it("同じ値は差分なし", () => {
    expect(isAiValueChanged({ projectName: "案件A" }, "projectName", "案件A")).toBe(false);
  });

  it("異なる値は差分あり", () => {
    expect(isAiValueChanged({ projectName: "案件A" }, "projectName", "案件B")).toBe(true);
  });

  it("配列は順序を含めて比較する", () => {
    expect(isAiValueChanged({ skills: ["React", "TypeScript"] }, "skills", ["React", "TypeScript"])).toBe(false);
    expect(isAiValueChanged({ skills: ["React", "TypeScript"] }, "skills", ["TypeScript", "React"])).toBe(true);
  });

  it("nullと空文字を同一視しない", () => {
    expect(isAiValueChanged({ role: null }, "role", "")).toBe(true);
  });
});

describe("F. CSV履歴の表示判定", () => {
  it("SKIPPED + FILE_DUPLICATEをエラー表示にしない", () => {
    expect(csvDisplayKind("SKIPPED", "FILE_DUPLICATE")).toBe("neutral");
  });

  it("SKIPPED + ALL_ROWS_SKIPPEDをエラー表示にしない", () => {
    expect(csvDisplayKind("SKIPPED", "ALL_ROWS_SKIPPED")).toBe("neutral");
  });

  it("ERRORをエラー表示にする", () => {
    expect(csvDisplayKind("ERROR", "ROW_ERROR")).toBe("error");
  });

  it("MOVE_PENDINGを警告表示にする", () => {
    expect(csvDisplayKind("SUCCESS", null, "MOVE_PENDING")).toBe("warning");
  });
});
