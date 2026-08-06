import { requireRole } from "@/lib/api/guard";
import { handleApi, jsonResponse } from "@/lib/api/handler";
import { parsePagination } from "@/lib/api/pagination";
import { okList } from "@/lib/api/response";
import { parseQuery } from "@/lib/api/validation";
import { csvImportQuerySchema } from "@/lib/schemas/csv-import";
import { listCsvImports } from "@/lib/services/csv-import-service";

export async function GET(request: Request) {
  return handleApi(async () => {
    await requireRole("ADMIN", "OPERATOR", "VIEWER");
    const params = new URL(request.url).searchParams;
    const page = parsePagination(params);
    const query = parseQuery(params, csvImportQuerySchema, ["page", "pageSize"]);
    const result = await listCsvImports(query, page);
    return jsonResponse(okList(result.data, result.pagination));
  });
}
