import { beforeEach, describe, expect, it, vi } from "vitest";

const sheetsMock = vi.hoisted(() => vi.fn());
const getMock = vi.hoisted(() => vi.fn());
const appendMock = vi.hoisted(() => vi.fn());

vi.mock("@googleapis/sheets", () => ({
  sheets: sheetsMock,
}));

import { parseEnv } from "@/lib/env";
import { createGoogleJwt, GOOGLE_API_SCOPES } from "@/lib/google/google-api";
import {
  createSheetsClient,
  type RawInboxRow,
} from "@/lib/google/sheets-client";

function configuredEnv() {
  return parseEnv({
    DATABASE_URL: "postgresql://test:test@localhost:5432/test",
    AUTH_SECRET: "auth-secret",
    AUTH_GOOGLE_ID: "google-id",
    AUTH_GOOGLE_SECRET: "google-secret",
    APP_URL: "http://localhost:3000",
    NEXTAUTH_URL: "http://localhost:3000",
    GOOGLE_CLIENT_EMAIL: "service@example.iam.gserviceaccount.com",
    GOOGLE_PRIVATE_KEY: "private\\nkey",
    GOOGLE_SHEETS_SPREADSHEET_ID: "spreadsheet-id",
  });
}

const row: RawInboxRow = [
  "RCP-20260807-12345678",
  "message-1",
  "user-1",
  "",
  "ACME",
  "田中",
  "TRUE",
  "2026-08-07T09:00:00.000+09:00",
  "text",
  '=HYPERLINK("http://evil.example.com","請求書")',
  "UNPROCESSED",
  "",
  "",
];

describe("Google Sheets client", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getMock.mockResolvedValue({ data: { values: [] } });
    appendMock.mockResolvedValue({ data: {} });
    sheetsMock.mockReturnValue({
      spreadsheets: { values: { get: getMock, append: appendMock } },
    });
  });

  it("uses a JWT with both Drive and Sheets scopes", () => {
    expect(GOOGLE_API_SCOPES).toEqual([
      "https://www.googleapis.com/auth/drive",
      "https://www.googleapis.com/auth/spreadsheets",
    ]);
    const jwt = createGoogleJwt(
      "service@example.com",
      "line1\\nline2",
    ) as unknown as {
      scopes: string[];
      key: string;
    };
    expect(jwt.scopes).toEqual([...GOOGLE_API_SCOPES]);
    expect(jwt.key).toBe("line1\nline2");
  });

  it("reads reception and message identifiers together from raw_inbox!A:B", async () => {
    getMock.mockResolvedValue({
      data: {
        values: [
          ["reception_id", "line_message_id"],
          ["RCP-1", "message-1"],
        ],
      },
    });
    const client = createSheetsClient(configuredEnv());
    await expect(client.getRawInboxIdentifiers()).resolves.toEqual([
      ["reception_id", "line_message_id"],
      ["RCP-1", "message-1"],
    ]);
    expect(getMock).toHaveBeenCalledOnce();
    expect(getMock).toHaveBeenCalledWith({
      spreadsheetId: "spreadsheet-id",
      range: "raw_inbox!A:B",
    });
  });

  it("reads settings A:E without caching", async () => {
    const client = createSheetsClient(configuredEnv());
    await client.getSettings();
    await client.getSettings();
    expect(getMock).toHaveBeenCalledTimes(2);
    expect(getMock).toHaveBeenNthCalledWith(1, {
      spreadsheetId: "spreadsheet-id",
      range: "settings!A:E",
    });
  });

  it("appends all 13 columns with RAW and INSERT_ROWS", async () => {
    const client = createSheetsClient(configuredEnv());
    await client.appendRawInbox(row);
    expect(appendMock).toHaveBeenCalledWith({
      spreadsheetId: "spreadsheet-id",
      range: "raw_inbox!A:M",
      valueInputOption: "RAW",
      insertDataOption: "INSERT_ROWS",
      requestBody: { values: [row] },
    });
    expect(appendMock.mock.calls[0][0].requestBody.values[0][9]).toBe(row[9]);
  });

  it("fails lazily when Sheets credentials are not configured", () => {
    const input = parseEnv({
      DATABASE_URL: "postgresql://test:test@localhost:5432/test",
      AUTH_SECRET: "auth-secret",
      AUTH_GOOGLE_ID: "google-id",
      AUTH_GOOGLE_SECRET: "google-secret",
      APP_URL: "http://localhost:3000",
      NEXTAUTH_URL: "http://localhost:3000",
    });
    expect(() => createSheetsClient(input)).toThrow(
      "GOOGLE_SHEETS_UNAVAILABLE",
    );
  });
});
