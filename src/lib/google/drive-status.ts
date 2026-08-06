import { toJstIso } from "@/lib/api/datetime";
import type { DriveClient } from "@/lib/google/drive-client";
import { googleDriveClient } from "@/lib/google/drive-client";

export type DriveStatus = {
  connected: boolean;
  inboxFiles: number | null;
  checkedAt: string;
  errorCode?: "GOOGLE_DRIVE_UNAVAILABLE";
};

export async function getDriveStatus(
  now = new Date(),
  client: DriveClient = googleDriveClient,
): Promise<DriveStatus> {
  try {
    const files = await client.listFiles();
    return {
      connected: true,
      inboxFiles: files.length,
      checkedAt: toJstIso(now) ?? "",
    };
  } catch {
    return {
      connected: false,
      inboxFiles: null,
      checkedAt: toJstIso(now) ?? "",
      errorCode: "GOOGLE_DRIVE_UNAVAILABLE",
    };
  }
}
