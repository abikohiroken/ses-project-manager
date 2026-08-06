import { requireWriteRole } from "@/lib/api/guard";
import { handleApi, jsonResponse } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { readJson } from "@/lib/api/validation";
import { uuidSchema } from "@/lib/schemas/common";
import { createProjectSchema } from "@/lib/schemas/intake";
import { createProjectFromIntake } from "@/lib/services/intake-service";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return handleApi(async () => {
    const user = await requireWriteRole("ADMIN", "OPERATOR");
    const { id } = await params;
    const input = await readJson(request, createProjectSchema);
    const project = await createProjectFromIntake(uuidSchema.parse(id), input, user.id);
    return jsonResponse(ok(project), 201);
  });
}
