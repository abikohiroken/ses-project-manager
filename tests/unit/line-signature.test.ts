import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { ApiError } from "@/lib/api/errors";
import { createLineSignature, verifyLineSignature } from "@/lib/line/signature";
import {
  LINE_WEBHOOK_MAX_BYTES,
  processLineWebhook,
} from "@/lib/line/webhook-service";

const secret = "line-channel-secret";

function bytes(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function signature(body: Uint8Array, value = secret): string {
  return createLineSignature(body, value).toString("base64");
}

async function expectCode(promise: Promise<unknown>, code: string) {
  await expect(promise).rejects.toMatchObject({ code });
}

describe("LINE signature verification", () => {
  it("accepts an exact valid signature", () => {
    const body = bytes('{"events":[]}');
    expect(verifyLineSignature(body, signature(body), secret)).toBe(true);
  });

  it("rejects a one-byte body change", () => {
    const original = bytes('{"events":[]}');
    const changed = bytes('{"events":[ ]}');
    expect(verifyLineSignature(changed, signature(original), secret)).toBe(
      false,
    );
  });

  it("rejects a missing signature", () => {
    expect(verifyLineSignature(bytes("{}"), null, secret)).toBe(false);
  });

  it("rejects a signature created by another channel secret", () => {
    const body = bytes('{"events":[]}');
    expect(
      verifyLineSignature(body, signature(body, "other-secret"), secret),
    ).toBe(false);
  });

  it("verifies Japanese text, CRLF, and emoji without normalizing the body", () => {
    const body = bytes('{"events":[],"text":"案件\r\n😀"}');
    expect(verifyLineSignature(body, signature(body), secret)).toBe(true);
  });

  it("uses timingSafeEqual instead of direct signature equality", async () => {
    const source = await readFile(
      path.resolve(process.cwd(), "src/lib/line/signature.ts"),
      "utf8",
    );
    expect(source).toContain("timingSafeEqual(supplied, expected)");
    expect(source).not.toContain("signature ===");
  });

  it("rejects an invalid signature before parsing invalid JSON", async () => {
    const body = bytes("not-json");
    await expectCode(
      processLineWebhook({ body, signature: "invalid", channelSecret: secret }),
      "INVALID_LINE_SIGNATURE",
    );
  });

  it("returns VALIDATION_ERROR for invalid JSON with a valid signature", async () => {
    const body = bytes("not-json");
    await expectCode(
      processLineWebhook({
        body,
        signature: signature(body),
        channelSecret: secret,
      }),
      "VALIDATION_ERROR",
    );
  });

  it("rejects bodies over 1 MiB", async () => {
    const body = new Uint8Array(LINE_WEBHOOK_MAX_BYTES + 1);
    await expectCode(
      processLineWebhook({
        body,
        signature: signature(body),
        channelSecret: secret,
      }),
      "PAYLOAD_TOO_LARGE",
    );
  });

  it("keeps ApiError status mapping stable", () => {
    expect(new ApiError("INVALID_LINE_SIGNATURE").status).toBe(401);
    expect(new ApiError("PAYLOAD_TOO_LARGE").status).toBe(413);
  });
});
