import { requireWriteRole } from "@/lib/api/guard";
import { handleApi, jsonResponse } from "@/lib/api/handler";
import { parsePagination } from "@/lib/api/pagination";
import { ok, okList } from "@/lib/api/response";
import { parseQuery, readJson } from "@/lib/api/validation";
import { userCreateSchema, userQuerySchema } from "@/lib/schemas/user";
import { createUser, listUsers } from "@/lib/services/user-service";

export async function GET(request: Request) {
  return handleApi(async () => {
    await requireWriteRole("ADMIN");
    const params = new URL(request.url).searchParams;
    const page = parsePagination(params);
    const query = parseQuery(params, userQuerySchema, ["page", "pageSize"]);
    const result = await listUsers(query, page);
    return jsonResponse(okList(result.data, result.pagination));
  });
}

export async function POST(request: Request) {
  return handleApi(async () => {
    await requireWriteRole("ADMIN");
    const input = await readJson(request, userCreateSchema);
    return jsonResponse(ok(await createUser(input)), 201);
  });
}
