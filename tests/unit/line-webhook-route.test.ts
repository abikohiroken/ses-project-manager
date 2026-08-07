import { beforeEach, describe, expect, it, vi } from "vitest";

const createSheetsClientMock = vi.hoisted(() => vi.fn());
const getSettingsMock = vi.hoisted(() => vi.fn());
const getIdentifiersMock = vi.hoisted(() => vi.fn());
const appendMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/google/sheets-client", () => ({
  createSheetsClient: createSheetsClientMock,
}));

import { createLineSignature } from "@/lib/line/signature";

const secret = "route-line-secret";

function bodyBytes(): Uint8Array {
  return new TextEncoder().encode(
    JSON.stringify({
      events: [
        {
          type: "message",
          timestamp: Date.parse("2026-08-07T00:00:00.000Z"),
          source: { type: "user", userId: "user-1" },
          message: { type: "text", id: "message-1", text: "案件" },
        },
      ],
    }),
  );
}

async function loadPost(lineSecret: string | undefined) {
  if (lineSecret === undefined) {
    vi.stubEnv("LINE_CHANNEL_SECRET", "");
  } else {
    vi.stubEnv("LINE_CHANNEL_SECRET", lineSecret);
  }
  vi.resetModules();
  return (await import("@/app/api/webhooks/line/route")).POST;
}

describe("POST /api/webhooks/line", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSettingsMock.mockResolvedValue([
      [
        "line_user_id",
        "line_group_id",
        "source_company",
        "source_contact",
        "is_allowed",
      ],
      ["user-1", "", "ACME", "田中", "TRUE"],
    ]);
    getIdentifiersMock.mockResolvedValue([["reception_id", "line_message_id"]]);
    appendMock.mockResolvedValue(undefined);
    createSheetsClientMock.mockReturnValue({
      getSettings: getSettingsMock,
      getRawInboxIdentifiers: getIdentifiersMock,
      appendRawInbox: appendMock,
    });
  });

  it("returns exactly received:true for a valid signed webhook", async () => {
    const POST = await loadPost(secret);
    const body = bodyBytes();
    const response = await POST(
      new Request("http://localhost/api/webhooks/line", {
        method: "POST",
        body: body.buffer as ArrayBuffer,
        headers: {
          "content-type": "application/json",
          "x-line-signature": createLineSignature(body, secret).toString(
            "base64",
          ),
        },
      }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ received: true });
    expect(appendMock).toHaveBeenCalledOnce();
  });

  it("returns 401 without exposing internal details for a bad signature", async () => {
    const POST = await loadPost(secret);
    const response = await POST(
      new Request("http://localhost/api/webhooks/line", {
        method: "POST",
        body: bodyBytes().buffer as ArrayBuffer,
        headers: { "x-line-signature": "bad-signature" },
      }),
    );
    const responseText = await response.text();
    expect(response.status).toBe(401);
    expect(responseText).toContain("INVALID_LINE_SIGNATURE");
    expect(responseText).not.toContain("stack");
    expect(responseText).not.toContain("bad-signature");
  });

  it("imports and runs without LINE configuration, then returns 503", async () => {
    const POST = await loadPost(undefined);
    const response = await POST(
      new Request("http://localhost/api/webhooks/line", {
        method: "POST",
        body: bodyBytes().buffer as ArrayBuffer,
      }),
    );
    expect(response.status).toBe(503);
  });

  it("returns 503 when Sheets configuration is unavailable at call time", async () => {
    createSheetsClientMock.mockImplementation(() => {
      throw new Error("GOOGLE_SHEETS_UNAVAILABLE private detail");
    });
    const POST = await loadPost(secret);
    const body = bodyBytes();
    const response = await POST(
      new Request("http://localhost/api/webhooks/line", {
        method: "POST",
        body: body.buffer as ArrayBuffer,
        headers: {
          "x-line-signature": createLineSignature(body, secret).toString(
            "base64",
          ),
        },
      }),
    );
    const responseText = await response.text();
    expect(response.status).toBe(503);
    expect(responseText).not.toContain("private detail");
  });
});
