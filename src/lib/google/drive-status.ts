import { toJstIso } from "@/lib/api/datetime";

export type DriveStatus = {
  connected: boolean;
  inboxFiles: number | null;
  checkedAt: string;
  errorCode?: "GOOGLE_DRIVE_UNAVAILABLE";
};

// Phase 2 intentionally reports an unconnected stub. Phase 4 replaces only this implementation.
export async function getDriveStatus(now = new Date()): Promise<DriveStatus> {
  return {
    connected: false,
    inboxFiles: null,
    checkedAt: toJstIso(now) ?? "",
    errorCode: "GOOGLE_DRIVE_UNAVAILABLE",
  };
}
