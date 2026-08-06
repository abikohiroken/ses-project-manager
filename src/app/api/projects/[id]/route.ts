import { requireRole, requireWriteRole } from "@/lib/api/guard";
import { handleApi, jsonResponse } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { readJson } from "@/lib/api/validation";
import { uuidSchema } from "@/lib/schemas/common";
import { projectUpdateSchema } from "@/lib/schemas/project";
import { getProject, updateProject } from "@/lib/services/project-service";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Context) {
  return handleApi(async () => {
    await requireRole("ADMIN", "OPERATOR", "VIEWER");
    const { id } = await params;
    return jsonResponse(ok(await getProject(uuidSchema.parse(id))));
  });
}

export async function PATCH(request: Request, { params }: Context) {
  return handleApi(async () => {
    const user = await requireWriteRole("ADMIN", "OPERATOR");
    const { id } = await params;
    const input = await readJson(request, projectUpdateSchema);
    return jsonResponse(ok(await updateProject(uuidSchema.parse(id), input, user.id)));
  });
}
