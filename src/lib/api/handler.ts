import { z } from "zod";

import {
  API_ERROR_DEFINITIONS,
  ApiError,
  mapPrismaError,
} from "@/lib/api/errors";
import { toJstIso } from "@/lib/api/datetime";
import { fail } from "@/lib/api/response";
import { zodErrorDetails } from "@/lib/api/validation";

function serialize(value: unknown): unknown {
  if (value instanceof Date) return toJstIso(value);
  if (Array.isArray(value)) return value.map(serialize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, serialize(item)]),
    );
  }
  return value;
}

export function jsonResponse(value: unknown, status = 200): Response {
  return Response.json(serialize(value), { status });
}

function errorResponse(error: ApiError): Response {
  return jsonResponse(
    fail(error.code, API_ERROR_DEFINITIONS[error.code].message, error.details),
    error.status,
  );
}

export async function handleApi(
  handler: () => Promise<Response>,
): Promise<Response> {
  try {
    return await handler();
  } catch (error) {
    if (error instanceof ApiError) return errorResponse(error);
    if (error instanceof z.ZodError) {
      return errorResponse(
        new ApiError("VALIDATION_ERROR", zodErrorDetails(error)),
      );
    }
    return errorResponse(mapPrismaError(error));
  }
}
