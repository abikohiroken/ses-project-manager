export const API_ERROR_DEFINITIONS = {
  AUTH_REQUIRED: { status: 401, message: "ログインが必要です。" },
  INVALID_LINE_SIGNATURE: {
    status: 401,
    message: "LINE署名が正しくありません。",
  },
  INVALID_CRON_SECRET: {
    status: 401,
    message: "認証情報が正しくありません。",
  },
  FORBIDDEN: { status: 403, message: "この操作を行う権限がありません。" },
  NOT_FOUND: { status: 404, message: "対象が見つかりません。" },
  VALIDATION_ERROR: { status: 400, message: "入力値を確認してください。" },
  INVALID_QUERY: { status: 400, message: "検索条件を確認してください。" },
  INTAKE_ALREADY_PROCESSED: {
    status: 409,
    message: "この確認待ち案件はすでに処理されています。",
  },
  OPTIMISTIC_LOCK_CONFLICT: {
    status: 409,
    message: "他の利用者により更新されています。再読み込みしてください。",
  },
  INVALID_STATE_TRANSITION: {
    status: 409,
    message: "現在の状態ではこの操作を実行できません。",
  },
  DUPLICATE_RECEPTION_ID: {
    status: 409,
    message: "同じ受付IDがすでに登録されています。",
  },
  DUPLICATE_LINE_MESSAGE_ID: {
    status: 409,
    message: "同じLINEメッセージがすでに登録されています。",
  },
  DUPLICATE_DRIVE_FILE: {
    status: 409,
    message: "同じDriveファイルがすでに処理されています。",
  },
  DUPLICATE_FILE_HASH: {
    status: 409,
    message: "同じ内容のCSVがすでに処理されています。",
  },
  PROJECT_CODE_EXHAUSTED: {
    status: 409,
    message: "本日の案件コードをこれ以上採番できません。",
  },
  DATABASE_UNAVAILABLE: {
    status: 503,
    message: "データベースを利用できません。",
  },
  GOOGLE_SHEETS_UNAVAILABLE: {
    status: 503,
    message: "Google Sheetsを利用できません。",
  },
  GOOGLE_DRIVE_UNAVAILABLE: {
    status: 503,
    message: "Google Driveを利用できません。",
  },
  INTERNAL_ERROR: {
    status: 500,
    message: "予期しないエラーが発生しました。",
  },
} as const;

export type ApiErrorCode = keyof typeof API_ERROR_DEFINITIONS;

export type ErrorDetail = {
  field?: string;
  reason: string;
};

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;
  readonly details?: ErrorDetail[];

  constructor(code: ApiErrorCode, details?: ErrorDetail[]) {
    const definition = API_ERROR_DEFINITIONS[code];
    super(definition.message);
    this.name = "ApiError";
    this.code = code;
    this.status = definition.status;
    this.details = details;
  }
}

type PrismaErrorLike = {
  code: string;
  meta?: Record<string, unknown>;
};

const duplicateCodes = new Set<ApiErrorCode>([
  "DUPLICATE_RECEPTION_ID",
  "DUPLICATE_LINE_MESSAGE_ID",
  "DUPLICATE_DRIVE_FILE",
  "DUPLICATE_FILE_HASH",
]);

function isPrismaErrorLike(error: unknown): error is PrismaErrorLike {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
  );
}

function targetText(error: PrismaErrorLike): string {
  const target = error.meta?.target;
  if (Array.isArray(target)) return target.join(" ");
  return typeof target === "string" ? target : "";
}

function duplicateCodeFor(error: PrismaErrorLike): ApiErrorCode | undefined {
  const target = targetText(error);
  if (/reception_?id/i.test(target)) return "DUPLICATE_RECEPTION_ID";
  if (/line_?message_?id/i.test(target)) return "DUPLICATE_LINE_MESSAGE_ID";
  if (/drive_?file_?id/i.test(target)) return "DUPLICATE_DRIVE_FILE";
  if (/file_?hash/i.test(target)) return "DUPLICATE_FILE_HASH";
  return undefined;
}

export type PrismaErrorMappingOptions = {
  uniqueConstraintCode?: ApiErrorCode;
  transactionConflictCode?: "OPTIMISTIC_LOCK_CONFLICT" | "DATABASE_UNAVAILABLE";
};

export function mapPrismaError(
  error: unknown,
  options: PrismaErrorMappingOptions = {},
): ApiError {
  if (!isPrismaErrorLike(error)) return new ApiError("INTERNAL_ERROR");

  if (error.code === "P2002") {
    const configuredCode = options.uniqueConstraintCode;
    const code =
      configuredCode && duplicateCodes.has(configuredCode)
        ? configuredCode
        : duplicateCodeFor(error);
    return new ApiError(code ?? "INTERNAL_ERROR");
  }

  if (error.code === "P2025") return new ApiError("NOT_FOUND");
  if (error.code === "P2034") {
    return new ApiError(
      options.transactionConflictCode ?? "OPTIMISTIC_LOCK_CONFLICT",
    );
  }
  if (error.code === "P2024" || error.code === "P2037") {
    return new ApiError("DATABASE_UNAVAILABLE");
  }
  return new ApiError("INTERNAL_ERROR");
}
