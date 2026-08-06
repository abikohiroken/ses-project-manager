import { requireWriteRole } from "@/lib/api/guard";
import { handleApi, jsonResponse } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { readJson } from "@/lib/api/validation";
import { uuidSchema } from "@/lib/schemas/common";
import { mergeIntakeSchema } from "@/lib/schemas/intake";
import { mergeIntake } from "@/lib/services/intake-service";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return handleApi(async () => {
    const user = await requireWriteRole("ADMIN", "OPERATOR");
    const { id } = await params;
    const input = await readJson(request, mergeIntakeSchema);
    return jsonResponse(ok(await mergeIntake(uuidSchema.parse(id), input, user.id)));
  });
}
