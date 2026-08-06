import { handleApi, jsonResponse } from "@/lib/api/handler";
import { requireCronSecret } from "@/lib/import/cron-auth";
import { retryMovePending } from "@/lib/import/import-reconcile";

export const runtime = "nodejs";

export async function POST(request: Request) {
  return handleApi(async () => {
    requireCronSecret(request);
    return jsonResponse({ retriedFiles: await retryMovePending() });
  });
}
