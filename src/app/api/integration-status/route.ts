import { requireRole } from "@/lib/api/guard";
import { handleApi, jsonResponse } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { getIntegrationStatus } from "@/lib/services/integration-status-service";

export async function GET() {
  return handleApi(async () => {
    await requireRole("ADMIN", "OPERATOR", "VIEWER");
    return jsonResponse(ok(await getIntegrationStatus()));
  });
}
