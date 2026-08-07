import { createHmac, timingSafeEqual } from "node:crypto";

export function createLineSignature(
  body: Uint8Array,
  channelSecret: string,
): Buffer {
  return createHmac("sha256", channelSecret).update(body).digest();
}

export function verifyLineSignature(
  body: Uint8Array,
  signature: string | null,
  channelSecret: string,
): boolean {
  if (!signature) return false;

  const expected = createLineSignature(body, channelSecret);
  let supplied: Buffer;
  try {
    supplied = Buffer.from(signature, "base64");
  } catch {
    return false;
  }

  return (
    supplied.length === expected.length && timingSafeEqual(supplied, expected)
  );
}
