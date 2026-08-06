import { handleApi, jsonResponse } from "@/lib/api/handler";
import { requireCronSecret } from "@/lib/import/cron-auth";
import { runGoogleDriveImport } from "@/lib/import/import-file";

export const runtime = "nodejs";

export async function POST(request: Request) {
  return handleApi(async () => {
    requireCronSecret(request);
    return jsonResponse(await runGoogleDriveImport());
  });
}
