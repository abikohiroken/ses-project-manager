import { requireWriteRole } from "@/lib/api/guard";
import { handleApi, jsonResponse } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { readJson } from "@/lib/api/validation";
import { uuidSchema } from "@/lib/schemas/common";
import { projectStateSchema } from "@/lib/schemas/project";
import { transitionProject } from "@/lib/services/project-service";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handleApi(async () => {
    const user = await requireWriteRole("ADMIN", "OPERATOR");
    const { id } = await params;
    const input = await readJson(request, projectStateSchema);
    return jsonResponse(ok(await transitionProject(uuidSchema.parse(id), "open", input.updatedAt, user.id)));
  });
}
