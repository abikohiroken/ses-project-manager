import { requireRole } from "@/lib/api/guard";
import { handleApi, jsonResponse } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { queryRecord } from "@/lib/api/validation";
import { uuidSchema } from "@/lib/schemas/common";
import { csvImportDetailQuerySchema } from "@/lib/schemas/csv-import";
import { getCsvImport } from "@/lib/services/csv-import-service";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return handleApi(async () => {
    await requireRole("ADMIN", "OPERATOR", "VIEWER");
    const { id } = await params;
    const query = csvImportDetailQuerySchema.parse(
      queryRecord(new URL(request.url).searchParams),
    );
    return jsonResponse(ok(await getCsvImport(uuidSchema.parse(id), query.rawDataRowId)));
  });
}
