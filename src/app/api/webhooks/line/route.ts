import { ApiError } from "@/lib/api/errors";
import { handleApi, jsonResponse } from "@/lib/api/handler";
import { env } from "@/lib/env";
import { processLineWebhook } from "@/lib/line/webhook-service";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  return handleApi(async () => {
    if (!env.LINE_CHANNEL_SECRET) {
      throw new ApiError("GOOGLE_SHEETS_UNAVAILABLE");
    }

    const body = new Uint8Array(await request.arrayBuffer());
    await processLineWebhook({
      body,
      signature: request.headers.get("x-line-signature"),
      channelSecret: env.LINE_CHANNEL_SECRET,
    });
    return jsonResponse({ received: true });
  });
}
