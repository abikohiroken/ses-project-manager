import { describe, expect, it } from "vitest";

import { fail, ok, okList } from "@/lib/api/response";

const requestIdPattern = /^REQ-[0-9a-f]{8}$/;

describe("API response envelopes", () => {
  it("creates a single-data envelope with request metadata", () => {
    const response = ok({ id: "project-1" });

    expect(response).toEqual({
      data: { id: "project-1" },
      meta: {
        requestId: expect.stringMatching(requestIdPattern),
        timestamp: expect.stringMatching(/\+09:00$/),
      },
    });
  });

  it("creates a list envelope with pagination", () => {
    const pagination = { page: 1, pageSize: 50, total: 1, totalPages: 1 };
    const response = okList([{ id: "project-1" }], pagination);

    expect(response.data).toHaveLength(1);
    expect(response.pagination).toEqual(pagination);
    expect(response.meta.requestId).toMatch(requestIdPattern);
  });

  it("creates an error envelope without internal error details", () => {
    const response = fail("VALIDATION_ERROR", "入力値を確認してください。", [
      { field: "projectName", reason: "必須です。" },
    ]);

    expect(response).toEqual({
      error: {
        code: "VALIDATION_ERROR",
        message: "入力値を確認してください。",
        details: [{ field: "projectName", reason: "必須です。" }],
        requestId: expect.stringMatching(requestIdPattern),
      },
    });
  });
});
