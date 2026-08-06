import { handleApi, jsonResponse } from "@/lib/api/handler";
import { requireRole } from "@/lib/api/guard";
import { parsePagination } from "@/lib/api/pagination";
import { okList } from "@/lib/api/response";
import { parseQuery } from "@/lib/api/validation";
import { intakeQuerySchema } from "@/lib/schemas/intake";
import { listIntakes } from "@/lib/services/intake-service";

export async function GET(request: Request) {
  return handleApi(async () => {
    await requireRole("ADMIN", "OPERATOR", "VIEWER");
    const params = new URL(request.url).searchParams;
    const page = parsePagination(params);
    const query = parseQuery(params, intakeQuerySchema, ["page", "pageSize"]);
    const result = await listIntakes(query, page);
    return jsonResponse(okList(result.data, result.pagination));
  });
}
