import type { BadgeTone } from "@/components/ui/badge";

export const projectStatusLabels: Record<string, string> = {
  OPEN: "募集中",
  ON_HOLD: "保留",
  CLOSED: "募集終了",
  ARCHIVED: "アーカイブ",
};

export const reviewStatusLabels: Record<string, string> = {
  PENDING: "確認待ち",
  REVIEWED: "正式登録済み",
  MERGED: "統合済み",
  REJECTED: "対象外",
};

export const warningLabels: Record<string, string> = {
  PROJECT_NAME_MISSING: "案件名",
  PRICE_AMBIGUOUS: "単価",
  START_MONTH_AMBIGUOUS: "開始時期",
  REQUIRED_SKILLS_MISSING: "必須スキル",
  MULTIPLE_LOCATIONS: "勤務地",
  CONFLICTING_INFORMATION: "条件矛盾",
  PROMPT_INJECTION_SUSPECTED: "原文内命令",
};

export const csvStatusLabels: Record<string, string> = {
  PENDING: "待機中",
  PROCESSING: "処理中",
  SUCCESS: "成功",
  PARTIAL_SUCCESS: "一部成功",
  ERROR: "エラー",
  SKIPPED: "スキップ",
};

export const driveMoveStatusLabels: Record<string, string> = {
  PENDING: "移動待ち",
  MOVED: "移動済み",
  MOVE_PENDING: "移動再試行待ち",
  ERROR: "移動エラー",
};

export const roleLabels: Record<string, string> = {
  ADMIN: "管理者",
  OPERATOR: "担当者",
  VIEWER: "閲覧者",
};

export function projectStatusTone(status: string): BadgeTone {
  if (status === "OPEN") return "green";
  if (status === "ON_HOLD") return "amber";
  if (status === "CLOSED") return "slate";
  return "red";
}
