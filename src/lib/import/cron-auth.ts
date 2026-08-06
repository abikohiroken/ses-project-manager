import { createHash, timingSafeEqual } from "node:crypto";

import { ApiError } from "@/lib/api/errors";
import { env } from "@/lib/env";

function digest(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

export function isValidCronAuthorization(
  authorization: string | null,
  secret: string | undefined,
): boolean {
  if (!authorization?.startsWith("Bearer ") || !secret) return false;
  const supplied = authorization.slice("Bearer ".length);
  return timingSafeEqual(digest(supplied), digest(secret));
}

export function requireCronSecret(request: Request): void {
  if (!isValidCronAuthorization(request.headers.get("authorization"), env.CRON_SECRET)) {
    throw new ApiError("INVALID_CRON_SECRET");
  }
}
