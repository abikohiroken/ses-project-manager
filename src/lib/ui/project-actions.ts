export type UiProjectStatus = "OPEN" | "ON_HOLD" | "CLOSED" | "ARCHIVED";
export type UiProjectAction = "open" | "hold" | "close" | "archive";

export type ProjectActionOption = {
  action: UiProjectAction;
  label: string;
};

const actionOptions: Record<UiProjectStatus, readonly ProjectActionOption[]> = {
  OPEN: [
    { action: "hold", label: "保留" },
    { action: "close", label: "募集終了" },
    { action: "archive", label: "アーカイブ" },
  ],
  ON_HOLD: [
    { action: "open", label: "再開" },
    { action: "archive", label: "アーカイブ" },
  ],
  CLOSED: [
    { action: "open", label: "再募集" },
    { action: "archive", label: "アーカイブ" },
  ],
  ARCHIVED: [],
};

export function projectActionsForStatus(
  status: UiProjectStatus,
): readonly ProjectActionOption[] {
  return actionOptions[status];
}
