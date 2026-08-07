import { sheets, type sheets_v4 } from "@googleapis/sheets";

import type { AppEnv } from "@/lib/env";
import { env } from "@/lib/env";
import { createGoogleJwt, withGoogleApiRetry } from "@/lib/google/google-api";

const RAW_INBOX_IDENTIFIERS_RANGE = "raw_inbox!A:B";
const RAW_INBOX_APPEND_RANGE = "raw_inbox!A:M";
const SETTINGS_RANGE = "settings!A:E";

export type RawInboxRow = [
  receptionId: string,
  lineMessageId: string,
  lineUserId: string,
  lineGroupId: string,
  sourceCompany: string,
  sourceContact: string,
  isAllowed: "TRUE" | "FALSE",
  receivedAt: string,
  messageType: "text",
  rawText: string,
  status: "UNPROCESSED" | "IGNORED",
  structuredAt: "",
  errorMessage: "",
];

export interface SheetsClient {
  getRawInboxIdentifiers(): Promise<string[][]>;
  getSettings(): Promise<string[][]>;
  appendRawInbox(row: RawInboxRow): Promise<void>;
}

type SheetsConfiguration = {
  clientEmail: string;
  privateKey: string;
  spreadsheetId: string;
};

function requireSheetsConfiguration(input: AppEnv): SheetsConfiguration {
  const entries = {
    clientEmail: input.GOOGLE_CLIENT_EMAIL,
    privateKey: input.GOOGLE_PRIVATE_KEY,
    spreadsheetId: input.GOOGLE_SHEETS_SPREADSHEET_ID,
  };
  if (Object.values(entries).some((value) => !value)) {
    throw new Error("GOOGLE_SHEETS_UNAVAILABLE");
  }
  return entries as SheetsConfiguration;
}

function createApi(configuration: SheetsConfiguration): sheets_v4.Sheets {
  const auth = createGoogleJwt(
    configuration.clientEmail,
    configuration.privateKey,
  );
  // @googleapis/sheets bundles its own auth-client types. The approved direct
  // google-auth-library version is runtime-compatible across that type boundary.
  return sheets({
    version: "v4",
    auth: auth as unknown as sheets_v4.Options["auth"],
  });
}

function values(response: {
  data: { values?: unknown[][] | null };
}): string[][] {
  return (response.data.values ?? []).map((row) =>
    row.map((cell) =>
      cell === null || cell === undefined ? "" : String(cell),
    ),
  );
}

export function createSheetsClient(input: AppEnv = env): SheetsClient {
  const configuration = requireSheetsConfiguration(input);
  const api = createApi(configuration);

  return {
    async getRawInboxIdentifiers() {
      const response = await withGoogleApiRetry(() =>
        api.spreadsheets.values.get({
          spreadsheetId: configuration.spreadsheetId,
          range: RAW_INBOX_IDENTIFIERS_RANGE,
        }),
      );
      return values(response);
    },

    async getSettings() {
      const response = await withGoogleApiRetry(() =>
        api.spreadsheets.values.get({
          spreadsheetId: configuration.spreadsheetId,
          range: SETTINGS_RANGE,
        }),
      );
      return values(response);
    },

    async appendRawInbox(row) {
      await withGoogleApiRetry(() =>
        api.spreadsheets.values.append({
          spreadsheetId: configuration.spreadsheetId,
          range: RAW_INBOX_APPEND_RANGE,
          valueInputOption: "RAW",
          insertDataOption: "INSERT_ROWS",
          requestBody: { values: [row] },
        }),
      );
    },
  };
}
