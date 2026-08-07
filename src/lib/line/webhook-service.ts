import { randomUUID } from "node:crypto";

import { ApiError } from "@/lib/api/errors";
import { jstDateKey, toJstIso } from "@/lib/api/datetime";
import {
  createSheetsClient,
  type RawInboxRow,
  type SheetsClient,
} from "@/lib/google/sheets-client";
import { verifyLineSignature } from "@/lib/line/signature";

export const LINE_WEBHOOK_MAX_BYTES = 1024 * 1024;

type TargetLineEvent = {
  timestamp: number;
  message: { id: string; type: "text"; text: string };
  source:
    | { type: "user"; userId: string }
    | { type: "group"; groupId: string; userId?: string };
};

type WebhookLogger = {
  info(fields: Record<string, string | number | boolean>): void;
  error(fields: Record<string, string | number | boolean>): void;
};

type ProcessWebhookOptions = {
  body: Uint8Array;
  signature: string | null;
  channelSecret: string;
  sheetsClient?: SheetsClient;
  createClient?: () => SheetsClient;
  now?: () => Date;
  uuid?: () => string;
  requestId?: string;
  logger?: WebhookLogger;
};

type SourcePermission = {
  sourceCompany: string;
  sourceContact: string;
  isAllowed: boolean;
};

const defaultLogger: WebhookLogger = {
  info: (fields) => console.info(fields),
  error: (fields) => console.error(fields),
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function targetEvent(value: unknown): TargetLineEvent | null {
  if (!isRecord(value) || value.type !== "message") return null;
  if (!isRecord(value.message) || value.message.type !== "text") return null;
  if (
    typeof value.message.id !== "string" ||
    typeof value.message.text !== "string"
  ) {
    return null;
  }
  if (!Number.isFinite(value.timestamp) || !isRecord(value.source)) return null;

  if (value.source.type === "user" && typeof value.source.userId === "string") {
    return value as TargetLineEvent;
  }
  if (
    value.source.type === "group" &&
    typeof value.source.groupId === "string"
  ) {
    if (
      value.source.userId !== undefined &&
      typeof value.source.userId !== "string"
    ) {
      return null;
    }
    return value as TargetLineEvent;
  }
  return null;
}

function parseEvents(body: Uint8Array): TargetLineEvent[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(body).toString("utf8"));
  } catch {
    throw new ApiError("VALIDATION_ERROR");
  }
  if (!isRecord(parsed) || !Array.isArray(parsed.events)) {
    throw new ApiError("VALIDATION_ERROR");
  }
  return parsed.events.flatMap((event) => {
    const target = targetEvent(event);
    return target ? [target] : [];
  });
}

function sourceIds(event: TargetLineEvent): {
  lineUserId: string;
  lineGroupId: string;
} {
  return event.source.type === "user"
    ? { lineUserId: event.source.userId, lineGroupId: "" }
    : {
        lineUserId: event.source.userId ?? "",
        lineGroupId: event.source.groupId,
      };
}

function findPermission(
  rows: string[][],
  lineUserId: string,
  lineGroupId: string,
): SourcePermission {
  const dataRows = rows.slice(1);
  const groupMatch = lineGroupId
    ? dataRows.find((row) => row[1] === lineGroupId)
    : undefined;
  const userMatch = lineUserId
    ? dataRows.find((row) => row[0] === lineUserId)
    : undefined;
  const match = groupMatch ?? userMatch;
  return {
    sourceCompany: match?.[2] ?? "",
    sourceContact: match?.[3] ?? "",
    isAllowed: match?.[4] === "TRUE",
  };
}

function identifiers(rows: string[][]): {
  receptionIds: Set<string>;
  lineMessageIds: Set<string>;
} {
  const dataRows = rows.slice(1);
  return {
    receptionIds: new Set(dataRows.map((row) => row[0]).filter(Boolean)),
    lineMessageIds: new Set(dataRows.map((row) => row[1]).filter(Boolean)),
  };
}

function receptionId(
  existing: Set<string>,
  now: () => Date,
  uuid: () => string,
): string {
  while (true) {
    const suffix = uuid()
      .replace(/[^a-z0-9]/gi, "")
      .toUpperCase()
      .slice(0, 8);
    const candidate = `RCP-${jstDateKey(now())}-${suffix}`;
    if (!existing.has(candidate)) return candidate;
  }
}

function toRawInboxRow(
  event: TargetLineEvent,
  generatedReceptionId: string,
  permission: SourcePermission,
): RawInboxRow {
  const { lineUserId, lineGroupId } = sourceIds(event);
  const receivedAt = toJstIso(new Date(event.timestamp));
  if (!receivedAt) throw new ApiError("VALIDATION_ERROR");
  return [
    generatedReceptionId,
    event.message.id,
    lineUserId,
    lineGroupId,
    permission.sourceCompany,
    permission.sourceContact,
    permission.isAllowed ? "TRUE" : "FALSE",
    receivedAt,
    "text",
    event.message.text,
    permission.isAllowed ? "UNPROCESSED" : "IGNORED",
    "",
    "",
  ];
}

export async function processLineWebhook(
  options: ProcessWebhookOptions,
): Promise<void> {
  const startedAt = Date.now();
  const logger = options.logger ?? defaultLogger;
  const requestId = options.requestId ?? randomUUID();

  if (options.body.byteLength > LINE_WEBHOOK_MAX_BYTES) {
    throw new ApiError("PAYLOAD_TOO_LARGE");
  }
  if (
    !verifyLineSignature(options.body, options.signature, options.channelSecret)
  ) {
    throw new ApiError("INVALID_LINE_SIGNATURE");
  }

  const events = parseEvents(options.body);
  if (events.length === 0) return;

  try {
    const client =
      options.sheetsClient ?? (options.createClient ?? createSheetsClient)();
    // Scoped to this request only; there is no cross-request settings cache.
    let settings: string[][] | undefined;

    for (const event of events) {
      const rows = await client.getRawInboxIdentifiers();
      const existing = identifiers(rows);
      if (existing.lineMessageIds.has(event.message.id)) {
        logger.info({
          event: "line_webhook",
          requestId,
          line_message_id: event.message.id,
          status: "DUPLICATE",
          elapsed_ms: Date.now() - startedAt,
        });
        continue;
      }

      settings ??= await client.getSettings();
      const generatedReceptionId = receptionId(
        existing.receptionIds,
        options.now ?? (() => new Date()),
        options.uuid ?? randomUUID,
      );
      const { lineUserId, lineGroupId } = sourceIds(event);
      const permission = findPermission(settings, lineUserId, lineGroupId);
      const row = toRawInboxRow(event, generatedReceptionId, permission);

      // Sheets cannot enforce uniqueness during simultaneous retries. This check
      // minimizes duplicates; the downstream project_intakes.line_message_id
      // UNIQUE constraint is the final defense and Phase 4 imports it as SKIPPED.
      await client.appendRawInbox(row);
      logger.info({
        event: "line_webhook",
        requestId,
        reception_id: generatedReceptionId,
        line_message_id: event.message.id,
        is_allowed: permission.isAllowed,
        status: "APPENDED",
        elapsed_ms: Date.now() - startedAt,
      });
    }
  } catch (error) {
    if (error instanceof ApiError) throw error;
    logger.error({
      event: "line_webhook",
      requestId,
      status: "SHEETS_UNAVAILABLE",
      elapsed_ms: Date.now() - startedAt,
    });
    throw new ApiError("GOOGLE_SHEETS_UNAVAILABLE");
  }
}
