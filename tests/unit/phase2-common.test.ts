import { describe, expect, it } from "vitest";
import { z } from "zod";

import { ApiError } from "@/lib/api/errors";
import { handleApi } from "@/lib/api/handler";
import { pagination, parsePagination } from "@/lib/api/pagination";
import { MAX_JSON_BODY_BYTES, readJson, zodErrorDetails } from "@/lib/api/validation";

describe("Phase 2 API handler", () => {
  it("converts ApiError to its status and error envelope", async () => {
    const response = await handleApi(async () => {
      throw new ApiError("FORBIDDEN");
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "FORBIDDEN", message: "この操作を行う権限がありません。" },
    });
  });

  it("converts ZodError to VALIDATION_ERROR with details", async () => {
    const response = await handleApi(async () => {
      z.object({ name: z.string().min(1) }).parse({ name: "" });
      return Response.json({});
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: "VALIDATION_ERROR",
        details: [{ field: "name" }],
      },
    });
  });

  it("hides an unexpected exception message and stack", async () => {
    const response = await handleApi(async () => {
      throw new Error("DATABASE_URL=secret-value unique-stack-marker");
    });
    const body = JSON.stringify(await response.json());

    expect(response.status).toBe(500);
    expect(body).toContain("INTERNAL_ERROR");
    expect(body).not.toContain("secret-value");
    expect(body).not.toContain("unique-stack-marker");
    expect(body).not.toContain("Error:");
  });
});

describe("pagination", () => {
  it("uses the default page and pageSize", () => {
    expect(parsePagination(new URLSearchParams())).toEqual({ page: 1, pageSize: 50 });
  });

  it.each([
    ["page", "0"],
    ["pageSize", "101"],
    ["page", "1.5"],
    ["pageSize", "abc"],
  ])("rejects invalid %s=%s", (key, value) => {
    expect(() => parsePagination(new URLSearchParams({ [key]: value }))).toThrowError(
      expect.objectContaining({ code: "INVALID_QUERY" }),
    );
  });

  it("calculates totalPages including total zero", () => {
    expect(pagination({ page: 1, pageSize: 50 }, 101).totalPages).toBe(3);
    expect(pagination({ page: 1, pageSize: 50 }, 0).totalPages).toBe(0);
  });
});

describe("request validation", () => {
  it("omits field when a Zod issue path is empty", () => {
    const schema = z.string().min(1);
    const result = schema.safeParse("");
    if (result.success) throw new Error("Expected validation failure.");

    expect(zodErrorDetails(result.error)).toEqual([
      { reason: expect.any(String) },
    ]);
  });

  it("returns PAYLOAD_TOO_LARGE with HTTP 413 for a body over 1MiB", async () => {
    const request = new Request("http://localhost/api/users", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ value: "x".repeat(MAX_JSON_BODY_BYTES) }),
    });
    const response = await handleApi(async () => {
      await readJson(request, z.object({ value: z.string() }));
      return Response.json({});
    });

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "PAYLOAD_TOO_LARGE" },
    });
  });
});
