import { ApiError } from "@/lib/api/errors";
import type { Pagination } from "@/lib/api/response";

export type PageInput = { page: number; pageSize: number };

function positiveInteger(
  value: string | null,
  fallback: number,
  field: "page" | "pageSize",
  maximum?: number,
): number {
  if (value === null) return fallback;
  if (!/^\d+$/.test(value)) {
    throw new ApiError("INVALID_QUERY", [
      { field, reason: "整数を指定してください。" },
    ]);
  }
  const parsed = Number(value);
  if (parsed < 1 || (maximum !== undefined && parsed > maximum)) {
    throw new ApiError("INVALID_QUERY", [
      {
        field,
        reason: maximum
          ? `1以上${maximum}以下で指定してください。`
          : "1以上で指定してください。",
      },
    ]);
  }
  return parsed;
}

export function parsePagination(params: URLSearchParams): PageInput {
  return {
    page: positiveInteger(params.get("page"), 1, "page"),
    pageSize: positiveInteger(params.get("pageSize"), 50, "pageSize", 100),
  };
}

export function pagination(input: PageInput, total: number): Pagination {
  return {
    ...input,
    total,
    totalPages: total === 0 ? 0 : Math.ceil(total / input.pageSize),
  };
}

export function pageOffset(input: PageInput): number {
  return (input.page - 1) * input.pageSize;
}
