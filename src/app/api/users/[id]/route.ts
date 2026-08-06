import { requireWriteRole } from "@/lib/api/guard";
import { handleApi, jsonResponse } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { readJson } from "@/lib/api/validation";
import { uuidSchema } from "@/lib/schemas/common";
import { userUpdateSchema } from "@/lib/schemas/user";
import { updateUser } from "@/lib/services/user-service";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return handleApi(async () => {
    await requireWriteRole("ADMIN");
    const { id } = await params;
    const input = await readJson(request, userUpdateSchema);
    return jsonResponse(ok(await updateUser(uuidSchema.parse(id), input)));
  });
}
