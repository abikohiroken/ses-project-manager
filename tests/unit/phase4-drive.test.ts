import { describe, expect, it, vi } from "vitest";

import { restorePrivateKey, withGoogleApiRetry } from "@/lib/google/drive-client";

describe("G. Google APIリトライ", () => {
  it("48. 429/5xxを1秒・2秒・4秒で最大3回再試行する", async () => {
    const operation = vi
      .fn()
      .mockRejectedValueOnce({ response: { status: 429 } })
      .mockRejectedValueOnce({ response: { status: 500 } })
      .mockRejectedValueOnce({ response: { status: 503 } })
      .mockResolvedValue("ok");
    const sleep = vi.fn().mockResolvedValue(undefined);

    await expect(withGoogleApiRetry(operation, { sleep, random: () => 0 })).resolves.toBe("ok");
    expect(sleep.mock.calls.map(([milliseconds]) => milliseconds)).toEqual([1_000, 2_000, 4_000]);
    expect(operation).toHaveBeenCalledTimes(4);
  });

  it("49. 認証・権限エラーを再試行しない", async () => {
    const operation = vi.fn().mockRejectedValue({ response: { status: 403 } });
    await expect(withGoogleApiRetry(operation)).rejects.toMatchObject({ response: { status: 403 } });
    expect(operation).toHaveBeenCalledTimes(1);
  });
});

describe("I. 秘密鍵の改行復元", () => {
  it("53. 文字列の\\nを実改行へ復元する", () => {
    expect(restorePrivateKey("line1\\nline2")).toBe("line1\nline2");
  });

  it("54. 実改行を壊さない", () => {
    expect(restorePrivateKey("line1\nline2")).toBe("line1\nline2");
  });
});
