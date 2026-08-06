import { Buffer } from "node:buffer";

import { z } from "zod";

import { ApiError, type ErrorDetail } from "@/lib/api/errors";

export const MAX_JSON_BODY_BYTES = 1024 * 1024;

export function queryRecord(
  params: URLSearchParams,
  omitted: readonly string[] = [],
): Record<string, string> {
  return Object.fromEntries(
    [...params.entries()].filter(([key]) => !omitted.includes(key)),
  );
}

export function zodErrorDetails(error: z.ZodError): ErrorDetail[] {
  return error.issues.map((issue) => ({
    ...(issue.path.length > 0 ? { field: issue.path.join(".") } : {}),
    reason: issue.message,
  }));
}

export async function readJson<T>(
  request: Request,
  schema: z.ZodType<T>,
): Promise<T> {
  const contentType = request.headers.get("content-type")?.toLowerCase();
  if (contentType?.split(";", 1)[0].trim() !== "application/json") {
    throw new ApiError("VALIDATION_ERROR", [
      { field: "content-type", reason: "application/jsonを指定してください。" },
    ]);
  }

  const declaredLength = request.headers.get("content-length");
  if (declaredLength && Number(declaredLength) > MAX_JSON_BODY_BYTES) {
    throw new ApiError("PAYLOAD_TOO_LARGE");
  }

  const text = await request.text();
  if (Buffer.byteLength(text, "utf8") > MAX_JSON_BODY_BYTES) {
    throw new ApiError("PAYLOAD_TOO_LARGE");
  }

  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new ApiError("VALIDATION_ERROR", [
      { reason: "JSON形式が正しくありません。" },
    ]);
  }
  return schema.parse(value);
}
