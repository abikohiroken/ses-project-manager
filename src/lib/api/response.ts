import { randomBytes } from "node:crypto";

import type { ApiErrorCode, ErrorDetail } from "@/lib/api/errors";

export type Pagination = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

function requestId(): string {
  return `REQ-${randomBytes(4).toString("hex")}`;
}

function jstTimestamp(date = new Date()): string {
  const jst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  return `${jst.toISOString().slice(0, -1)}+09:00`;
}

function meta() {
  return {
    requestId: requestId(),
    timestamp: jstTimestamp(),
  };
}

export function ok<T>(data: T) {
  return { data, meta: meta() };
}

export function okList<T>(data: T[], pagination: Pagination) {
  return { data, pagination, meta: meta() };
}

export function fail(
  code: ApiErrorCode,
  message: string,
  details?: ErrorDetail[],
) {
  return {
    error: {
      code,
      message,
      ...(details ? { details } : {}),
      requestId: requestId(),
    },
  };
}
