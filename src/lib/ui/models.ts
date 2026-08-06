import type { BusinessValues } from "@/lib/ui/business-fields";
import type { UiProjectStatus, UiProjectAction } from "@/lib/ui/project-actions";

export type IntakeEditorView = BusinessValues & {
  id: string;
  receptionId: string;
  reviewStatus: "PENDING" | "REVIEWED" | "MERGED" | "REJECTED";
  warningCodes: string[];
  receivedAt: string;
  updatedAt: string;
  aiSnapshot: Record<string, unknown>;
  source: {
    sourceCompany: string | null;
    sourceContact: string | null;
    rawText: string;
    receivedAt: string;
  } | null;
};

export type ProjectEditorView = BusinessValues & {
  id: string;
  projectCode: string;
  projectStatus: UiProjectStatus;
  updatedAt: string;
};

export type ProjectSearchItem = {
  id: string;
  projectCode: string;
  projectName: string;
  projectStatus: UiProjectStatus;
  updatedAt: string;
};

export type ApiDetailResponse<T> = { data: T };
export type ApiListResponse<T> = { data: T[] };

export type ApiErrorDetail = { field?: string; reason: string };

export type ApiErrorBody = {
  error: {
    code: string;
    message: string;
    details?: ApiErrorDetail[];
  };
};

export type UserView = {
  id: string;
  email: string;
  name: string;
  role: "ADMIN" | "OPERATOR" | "VIEWER";
  isActive: boolean;
  lastLoginAt: string | null;
  updatedAt: string;
};

export type CsvImportRowView = {
  id: string;
  rowNumber: number;
  receptionId: string | null;
  status: "SUCCESS" | "ERROR" | "SKIPPED";
  errorCode: string | null;
  errorMessage: string | null;
  rawData?: unknown;
};

export type CsvImportDetailView = {
  id: string;
  driveFileId: string;
  fileHash: string | null;
  fileName: string;
  schemaVersion: string | null;
  batchId: string | null;
  status: string;
  driveMoveStatus: string;
  totalRows: number;
  successRows: number;
  failedRows: number;
  skippedRows: number;
  importedAt: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  duplicateOfImport: {
    id: string;
    fileName: string;
    batchId: string | null;
    importedAt: string | null;
  } | null;
  rows: CsvImportRowView[];
};

export type PendingProjectAction = { action: UiProjectAction; label: string };
