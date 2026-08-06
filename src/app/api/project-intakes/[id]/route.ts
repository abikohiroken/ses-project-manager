import { handleApi, jsonResponse } from "@/lib/api/handler";
import { requireRole, requireWriteRole } from "@/lib/api/guard";
import { ok } from "@/lib/api/response";
import { readJson } from "@/lib/api/validation";
import { uuidSchema } from "@/lib/schemas/common";
import { intakeUpdateSchema } from "@/lib/schemas/intake";
import { getIntake, updateIntake } from "@/lib/services/intake-service";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Context) {
  return handleApi(async () => {
    await requireRole("ADMIN", "OPERATOR", "VIEWER");
    const { id } = await params;
    return jsonResponse(ok(await getIntake(uuidSchema.parse(id))));
  });
}

export async function PATCH(request: Request, { params }: Context) {
  return handleApi(async () => {
    await requireWriteRole("ADMIN", "OPERATOR");
    const { id } = await params;
    const input = await readJson(request, intakeUpdateSchema);
    return jsonResponse(ok(await updateIntake(uuidSchema.parse(id), input)));
  });
}
