import { drive, type drive_v3 } from "@googleapis/drive";
import { JWT } from "google-auth-library";

import type { AppEnv } from "@/lib/env";
import { env } from "@/lib/env";

const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive";
const MAX_RETRIES = 3;

export type DriveFile = {
  id: string;
  name: string;
  mimeType: string | null;
  size: number | null;
  createdTime: string | null;
  modifiedTime: string | null;
  parents: string[];
};

export type MoveDestination = "processed" | "error";

export interface DriveClient {
  listFiles(): Promise<DriveFile[]>;
  downloadFile(fileId: string): Promise<Uint8Array>;
  moveFile(fileId: string, destination: MoveDestination): Promise<void>;
}

type RetryOptions = {
  sleep?: (milliseconds: number) => Promise<void>;
  random?: () => number;
};

export function restorePrivateKey(value: string): string {
  return value.replace(/\\n/g, "\n");
}

function googleStatus(error: unknown): number | null {
  if (typeof error !== "object" || error === null) return null;
  const candidate = error as {
    code?: unknown;
    response?: { status?: unknown };
  };
  if (typeof candidate.response?.status === "number") return candidate.response.status;
  return typeof candidate.code === "number" ? candidate.code : null;
}

function isRetryableGoogleStatus(status: number | null): boolean {
  return status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
}

const defaultSleep = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

export async function withGoogleApiRetry<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const sleep = options.sleep ?? defaultSleep;
  const random = options.random ?? Math.random;
  let retry = 0;
  while (true) {
    try {
      return await operation();
    } catch (error) {
      if (!isRetryableGoogleStatus(googleStatus(error)) || retry >= MAX_RETRIES) {
        throw error;
      }
      const baseDelay = 1_000 * 2 ** retry;
      const jitter = Math.floor(random() * 250);
      retry += 1;
      await sleep(baseDelay + jitter);
    }
  }
}

type DriveConfiguration = {
  clientEmail: string;
  privateKey: string;
  inboxFolderId: string;
  processedFolderId: string;
  errorFolderId: string;
};

function requireDriveConfiguration(input: AppEnv): DriveConfiguration {
  const entries = {
    clientEmail: input.GOOGLE_CLIENT_EMAIL,
    privateKey: input.GOOGLE_PRIVATE_KEY,
    inboxFolderId: input.GOOGLE_DRIVE_INBOX_FOLDER_ID,
    processedFolderId: input.GOOGLE_DRIVE_PROCESSED_FOLDER_ID,
    errorFolderId: input.GOOGLE_DRIVE_ERROR_FOLDER_ID,
  };
  if (Object.values(entries).some((value) => !value)) {
    throw new Error("GOOGLE_DRIVE_UNAVAILABLE");
  }
  return entries as DriveConfiguration;
}

function createApi(configuration: DriveConfiguration): drive_v3.Drive {
  const auth = new JWT({
    email: configuration.clientEmail,
    key: restorePrivateKey(configuration.privateKey),
    scopes: [DRIVE_SCOPE],
  });
  // @googleapis/drive@21 bundles google-auth-library v10 types while the
  // approved direct dependency is v11. The runtime AuthClient contract is
  // compatible, so bridge only that duplicated-package type boundary.
  return drive({
    version: "v3",
    auth: auth as unknown as drive_v3.Options["auth"],
  });
}

function toBytes(data: unknown): Uint8Array {
  if (Buffer.isBuffer(data)) return new Uint8Array(data);
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (ArrayBuffer.isView(data)) {
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  }
  throw new Error("DRIVE_DOWNLOAD_FAILED");
}

export function createDriveClient(input: AppEnv = env): DriveClient {
  const configuration = requireDriveConfiguration(input);
  const api = createApi(configuration);

  return {
    async listFiles() {
      const response = await withGoogleApiRetry(() =>
        api.files.list({
          q: `'${configuration.inboxFolderId}' in parents and trashed = false`,
          fields: "files(id,name,mimeType,size,createdTime,modifiedTime,parents)",
          orderBy: "createdTime asc,name asc",
          pageSize: 10,
        }),
      );
      return (response.data.files ?? []).flatMap((file) => {
        if (!file.id || !file.name) return [];
        const size = file.size === null || file.size === undefined ? null : Number(file.size);
        return [
          {
            id: file.id,
            name: file.name,
            mimeType: file.mimeType ?? null,
            size: size !== null && Number.isFinite(size) ? size : null,
            createdTime: file.createdTime ?? null,
            modifiedTime: file.modifiedTime ?? null,
            parents: file.parents ?? [],
          },
        ];
      });
    },

    async downloadFile(fileId) {
      const response = await withGoogleApiRetry(() =>
        api.files.get(
          { fileId, alt: "media" },
          { responseType: "arraybuffer" },
        ),
      );
      return toBytes(response.data);
    },

    async moveFile(fileId, destination) {
      const addParents =
        destination === "processed"
          ? configuration.processedFolderId
          : configuration.errorFolderId;
      await withGoogleApiRetry(() =>
        api.files.update({
          fileId,
          addParents,
          removeParents: configuration.inboxFolderId,
          fields: "id,parents",
        }),
      );
    },
  };
}

export const googleDriveClient: DriveClient = {
  listFiles: () => createDriveClient().listFiles(),
  downloadFile: (fileId) => createDriveClient().downloadFile(fileId),
  moveFile: (fileId, destination) => createDriveClient().moveFile(fileId, destination),
};
