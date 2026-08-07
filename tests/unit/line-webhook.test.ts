import { describe, expect, it, vi } from "vitest";

import { createLineSignature } from "@/lib/line/signature";
import { processLineWebhook } from "@/lib/line/webhook-service";
import type { SheetsClient } from "@/lib/google/sheets-client";

const secret = "line-channel-secret";
const header = [
  "line_user_id",
  "line_group_id",
  "source_company",
  "source_contact",
  "is_allowed",
];

function userEvent(
  id = "message-1",
  text = "案件原文",
  timestamp = Date.parse("2026-08-06T05:20:30.000Z"),
) {
  return {
    type: "message",
    timestamp,
    source: { type: "user", userId: "user-1" },
    message: { type: "text", id, text },
  };
}

function groupEvent(id = "message-1", userId: string | null = "user-1") {
  return {
    type: "message",
    timestamp: Date.parse("2026-08-06T05:20:30.000Z"),
    source: {
      type: "group",
      groupId: "group-1",
      ...(userId !== null ? { userId } : {}),
    },
    message: { type: "text", id, text: "グループ案件" },
  };
}

function mockClient(
  options: {
    settings?: string[][];
    identifiers?: string[][] | string[][][];
    appendFailureAt?: number;
    getFailure?: boolean;
  } = {},
): SheetsClient & {
  getRawInboxIdentifiers: ReturnType<typeof vi.fn>;
  getSettings: ReturnType<typeof vi.fn>;
  appendRawInbox: ReturnType<typeof vi.fn>;
} {
  const identifierResponses = options.identifiers ?? [
    ["reception_id", "line_message_id"],
  ];
  let getIndex = 0;
  let appendIndex = 0;
  return {
    getSettings: vi.fn(async () => {
      if (options.getFailure) throw new Error("private sheets detail");
      return (
        options.settings ?? [header, ["user-1", "", "ACME", "田中", "TRUE"]]
      );
    }),
    getRawInboxIdentifiers: vi.fn(async () => {
      if (options.getFailure) throw new Error("private sheets detail");
      if (Array.isArray(identifierResponses[0]?.[0])) {
        const responses = identifierResponses as string[][][];
        return responses[Math.min(getIndex++, responses.length - 1)];
      }
      return identifierResponses as string[][];
    }),
    appendRawInbox: vi.fn(async () => {
      appendIndex += 1;
      if (appendIndex === options.appendFailureAt)
        throw new Error("private append detail");
    }),
  };
}

async function run(
  events: unknown[],
  client = mockClient(),
  overrides: Partial<Parameters<typeof processLineWebhook>[0]> = {},
) {
  const body = new TextEncoder().encode(JSON.stringify({ events }));
  await processLineWebhook({
    body,
    signature: createLineSignature(body, secret).toString("base64"),
    channelSecret: secret,
    sheetsClient: client,
    now: () => new Date("2026-08-06T15:30:00.000Z"),
    uuid: () => "12345678-aaaa-bbbb-cccc-123456789012",
    requestId: "request-1",
    logger: { info: vi.fn(), error: vi.fn() },
    ...overrides,
  });
  return client;
}

describe("LINE event dispatch", () => {
  it("processes user and group text messages", async () => {
    const client = mockClient();
    await run([userEvent("user-message"), groupEvent("group-message")], client);
    expect(client.appendRawInbox).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["image", { ...userEvent(), message: { type: "image", id: "image-1" } }],
    ["follow", { type: "follow", source: { type: "user", userId: "user-1" } }],
    [
      "unfollow",
      { type: "unfollow", source: { type: "user", userId: "user-1" } },
    ],
    ["join", { type: "join", source: { type: "group", groupId: "group-1" } }],
    ["leave", { type: "leave", source: { type: "group", groupId: "group-1" } }],
    [
      "postback",
      { type: "postback", source: { type: "user", userId: "user-1" } },
    ],
    ["room", { ...userEvent(), source: { type: "room", roomId: "room-1" } }],
  ])("ignores %s events with success", async (_label, event) => {
    const client = await run([event]);
    expect(client.getSettings).not.toHaveBeenCalled();
    expect(client.appendRawInbox).not.toHaveBeenCalled();
  });

  it("returns successfully when no target event exists", async () => {
    const client = await run([]);
    expect(client.getRawInboxIdentifiers).not.toHaveBeenCalled();
  });
});

describe("source fields, reception ID, and received time", () => {
  it("writes user ID and leaves group ID blank for user sources", async () => {
    const client = await run([userEvent()]);
    expect(client.appendRawInbox.mock.calls[0][0].slice(2, 4)).toEqual([
      "user-1",
      "",
    ]);
  });

  it("writes both IDs for group sources", async () => {
    const client = await run([groupEvent()]);
    expect(client.appendRawInbox.mock.calls[0][0].slice(2, 4)).toEqual([
      "user-1",
      "group-1",
    ]);
  });

  it("allows a group source without a user ID", async () => {
    const client = await run([groupEvent("message-1", null)]);
    expect(client.appendRawInbox.mock.calls[0][0].slice(2, 4)).toEqual([
      "",
      "group-1",
    ]);
  });

  it("generates RCP-YYYYMMDD-XXXXXXXX using JST independently of local TZ", async () => {
    const client = await run([userEvent()]);
    expect(client.appendRawInbox.mock.calls[0][0][0]).toBe(
      "RCP-20260807-12345678",
    );
  });

  it("regenerates only a reception ID already present in the sheet", async () => {
    const client = mockClient({
      identifiers: [
        ["reception_id", "line_message_id"],
        ["RCP-20260807-AAAAAAAA", "old-message"],
      ],
    });
    const uuids = ["aaaaaaaa-0000", "bbbbbbbb-0000"];
    await run([userEvent()], client, {
      uuid: () => uuids.shift() ?? "cccccccc",
    });
    expect(client.appendRawInbox.mock.calls[0][0][0]).toBe(
      "RCP-20260807-BBBBBBBB",
    );
  });

  it("builds received_at from event.timestamp in +09:00 format", async () => {
    const client = await run([userEvent()]);
    expect(client.appendRawInbox.mock.calls[0][0][7]).toBe(
      "2026-08-06T14:20:30.000+09:00",
    );
  });
});

describe("settings authorization and raw_inbox row", () => {
  it("prioritizes a matching group over a matching user", async () => {
    const client = mockClient({
      settings: [
        header,
        ["user-1", "", "USER CO", "User Contact", "TRUE"],
        ["", "group-1", "GROUP CO", "Group Contact", "FALSE"],
      ],
    });
    await run([groupEvent()], client);
    expect(client.appendRawInbox.mock.calls[0][0].slice(4, 7)).toEqual([
      "GROUP CO",
      "Group Contact",
      "FALSE",
    ]);
    expect(client.appendRawInbox.mock.calls[0][0][10]).toBe("IGNORED");
  });

  it("maps TRUE to allowed and UNPROCESSED", async () => {
    const client = await run([userEvent()]);
    expect(client.appendRawInbox.mock.calls[0][0].slice(4, 7)).toEqual([
      "ACME",
      "田中",
      "TRUE",
    ]);
    expect(client.appendRawInbox.mock.calls[0][0][10]).toBe("UNPROCESSED");
  });

  it("maps FALSE to denied and IGNORED while still appending", async () => {
    const client = mockClient({
      settings: [header, ["user-1", "", "ACME", "田中", "FALSE"]],
    });
    await run([userEvent()], client);
    expect(client.appendRawInbox).toHaveBeenCalledOnce();
    expect(client.appendRawInbox.mock.calls[0][0][6]).toBe("FALSE");
    expect(client.appendRawInbox.mock.calls[0][0][10]).toBe("IGNORED");
  });

  it("maps an unregistered source to blank fields, FALSE, and IGNORED", async () => {
    const client = mockClient({ settings: [header] });
    await run([userEvent()], client);
    expect(client.appendRawInbox.mock.calls[0][0].slice(4, 7)).toEqual([
      "",
      "",
      "FALSE",
    ]);
    expect(client.appendRawInbox.mock.calls[0][0][10]).toBe("IGNORED");
  });

  it("writes exactly 13 ordered columns and preserves raw text byte-for-byte", async () => {
    const rawText =
      '  =HYPERLINK("http://evil.example.com","請求書")\r\n@IMPORTXML(...)  ';
    const client = await run([userEvent("message-1", rawText)]);
    const row = client.appendRawInbox.mock.calls[0][0];
    expect(row).toHaveLength(13);
    expect(row[1]).toBe("message-1");
    expect(row[8]).toBe("text");
    expect(row[9]).toBe(rawText);
    expect(row.slice(11)).toEqual(["", ""]);
  });
});

describe("deduplication, failures, and safe logging", () => {
  it("does not append an existing line_message_id and uses one A:B read", async () => {
    const client = mockClient({
      identifiers: [
        ["reception_id", "line_message_id"],
        ["RCP-20260801-OLD00001", "message-1"],
      ],
    });
    await run([userEvent()], client);
    expect(client.getRawInboxIdentifiers).toHaveBeenCalledOnce();
    expect(client.getSettings).not.toHaveBeenCalled();
    expect(client.appendRawInbox).not.toHaveBeenCalled();
  });

  it("maps Sheets values.get failures to 503", async () => {
    const client = mockClient({ getFailure: true });
    await expect(run([userEvent()], client)).rejects.toMatchObject({
      code: "GOOGLE_SHEETS_UNAVAILABLE",
      status: 503,
    });
  });

  it("maps Sheets append failures to 503", async () => {
    const client = mockClient({ appendFailureAt: 1 });
    await expect(run([userEvent()], client)).rejects.toMatchObject({
      code: "GOOGLE_SHEETS_UNAVAILABLE",
      status: 503,
    });
  });

  it("returns 503 when a later event fails after an earlier append", async () => {
    const client = mockClient({ appendFailureAt: 2 });
    await expect(
      run([userEvent("message-1"), userEvent("message-2")], client),
    ).rejects.toMatchObject({
      status: 503,
    });
    expect(client.appendRawInbox).toHaveBeenCalledTimes(2);
  });

  it("logs only approved metadata and never body, raw_text, signature, or secret", async () => {
    const logger = { info: vi.fn(), error: vi.fn() };
    const dangerous = "TOP-SECRET-RAW-TEXT";
    await run([userEvent("message-1", dangerous)], mockClient(), { logger });
    const output = JSON.stringify(logger.info.mock.calls);
    expect(output).not.toContain(dangerous);
    expect(output).not.toContain(secret);
    expect(output).not.toContain("x-line-signature");
    expect(Object.keys(logger.info.mock.calls[0][0]).sort()).toEqual(
      [
        "elapsed_ms",
        "event",
        "is_allowed",
        "line_message_id",
        "reception_id",
        "requestId",
        "status",
      ].sort(),
    );
  });
});
