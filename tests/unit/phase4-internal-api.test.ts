import { beforeEach, describe, expect, it, vi } from "vitest";

const dependencies = vi.hoisted(() => ({
  runGoogleDriveImport: vi.fn(),
}));

vi.mock("@/lib/import/import-file", () => ({
  runGoogleDriveImport: dependencies.runGoogleDriveImport,
}));

import { POST } from "@/app/api/internal/google-drive-import/route";
import { isValidCronAuthorization } from "@/lib/import/cron-auth";

beforeEach(() => {
  vi.clearAllMocks();
  dependencies.runGoogleDriveImport.mockResolvedValue({
    checkedAt: "2026-08-06T03:00:00.000Z",
    listedFiles: 1,
    processedFiles: 1,
    successFiles: 0,
    partialSuccessFiles: 0,
    errorFiles: 1,
    skippedFiles: 0,
    movePendingFiles: 0,
  });
});

describe("G. 内部API認証", () => {
  it("44. CRON_SECRET不正を401 INVALID_CRON_SECRETにする", async () => {
    const response = await POST(
      new Request("http://localhost/api/internal/google-drive-import", {
        method: "POST",
        headers: { Authorization: "Bearer wrong" },
      }),
    );
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "INVALID_CRON_SECRET" },
    });
  });

  it("45. 固定長digestをtimingSafeEqualで比較する", () => {
    expect(isValidCronAuthorization("Bearer test-cron-secret", "test-cron-secret")).toBe(true);
    expect(isValidCronAuthorization("Bearer short", "a-much-longer-secret")).toBe(false);
  });

  it("46. 個別ファイルERRORを含む実行結果でも200を返す", async () => {
    const response = await POST(
      new Request("http://localhost/api/internal/google-drive-import", {
        method: "POST",
        headers: { Authorization: "Bearer test-cron-secret" },
      }),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ errorFiles: 1 });
  });
});
