export type CsvDisplayKind = "success" | "info" | "warning" | "error" | "neutral";

export function csvDisplayKind(
  status: string,
  errorCode: string | null | undefined,
  driveMoveStatus?: string,
): CsvDisplayKind {
  if (driveMoveStatus === "MOVE_PENDING") return "warning";
  if (status === "ERROR") return "error";
  if (status === "PARTIAL_SUCCESS") return "warning";
  if (status === "SUCCESS") return "success";
  if (status === "PROCESSING" || status === "PENDING") return "info";
  if (
    status === "SKIPPED" &&
    (errorCode === "FILE_DUPLICATE" || errorCode === "ALL_ROWS_SKIPPED")
  ) {
    return "neutral";
  }
  return "neutral";
}
