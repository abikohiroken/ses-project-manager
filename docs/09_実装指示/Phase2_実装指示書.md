# Phase 2 実装指示書 — API群

作成日時: 2026-08-06 11:55 +09:00
対象リポジトリ: `abikohiroken/ses-project-manager`
作業ブランチ: `feature/phase2-api`（最新 `main` から作成すること）

---

## 0. 実装AIへの前提

### 0.1 あなたの役割

`docs/` の設計一式に従い、**Phase 2（API群）のみ**を実装する。

設計は確定している。**設計を作り直さない。設計に書かれていない仕様を発明しない。**

### 0.2 文書の優先順位

```text
1. docs/09_実装指示/設計差分_v1.2_実装前確定事項.md
2. 本書（Phase2_実装指示書.md）
3. docs/04_API/API詳細設計書_v1.0.md
4. docs/02_DB-Prisma/ / docs/03_CSV-Drive取込/ / docs/05_画面/
5. docs/01_基本設計/基本設計_v2.5差分_LINE受信経路修正.md
6. docs/01_基本設計/SES案件管理WEBアプリ_基本設計書_v2.4_確定版.md
```

基本設計 v2.4 は最古で、詳細設計と矛盾する箇所が複数ある。単独で根拠にしない。

`docs/04_API/openapi_v1.yaml` は概要用であり、DB制約と状態遷移の最終仕様は API詳細設計書と本書を正とする。

### 0.3 判断に迷ったら

設計書に答えがない事項を見つけたら、**推測して実装せず、作業を止めて質問する。**

### 0.4 Phase 1 で失敗した点（繰り返さないこと）

- 指示したテストのうち一部セクションだけ実装し、報告に「積み残しなし」と書いた
- **実装が正しいことと、回帰を検知できることは別問題である**
- 本書 §10 の報告フォーマットは**セクション単位の消化状況を必須**にしている。未消化があれば必ずそう書く

---

## 1. スコープ

### 1.1 実装する

| 系統 | エンドポイント数 |
|---|---:|
| 確認待ち案件 `project-intakes` | 6 |
| 正式案件 `projects` | 7 |
| CSV取込履歴 `csv-imports` | 2 |
| 連携状態 `integration-status` | 1 |
| ユーザー管理 `users` | 3 |

あわせて共通モジュール（§4）とユニットテスト（§7）。

### 1.2 実装しない

**絶対に実装しない。ファイルも作らない。**

- 画面（Phase 3）— API のみ。UIコンポーネントを作らない
- CSVパーサー・Drive Client・取込処理（Phase 4）
- 内部Cron API `/api/internal/*`（Phase 4）
- LINE Webhook・Google Sheets連携（Phase 5）
- GAS・ChatGPTプロンプト（Phase 6）

「ついでに作っておく」ことをしない。

---

## 2. 技術前提（すべて実測確認済み）

Phase 1 で確定した構成をそのまま使う。**依存を追加しない。**

| 区分 | 版 |
|---|---|
| Node.js | 22.x |
| Next.js | 16.3.0（App Router / Route Handlers） |
| Prisma | ~7.9.0 + `@prisma/adapter-pg` |
| next-auth | 4.24.15 |
| Zod | ^4.1.12（実体 4.4.3） |
| Vitest | ^4.0.8 |

### 2.1 Next.js 16 の Route Handler では params が Promise

Next.js 16 同梱ドキュメントで確認済み。**必ず `await` する。**

```ts
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
}
```

### 2.2 Zod 4 の注意

実測結果:

- `z.string().email()` と `z.email()` は**どちらも動作する**。既存コードの書き方に合わせる
- `z.string().uuid()` / `z.uuid()` も同様
- `ZodError` の issue は `{ code, path, message, expected }` 形式。`path` は配列

`ZodError` を API の `ErrorDetail[]` へ変換する際は次の対応とする。

```text
field  ← issue.path.join(".")   （path が空配列なら field を省略）
reason ← issue.message
```

### 2.3 日付の扱い（重要）

`start_month` / `end_month` は Prisma の `@db.Date` である。**ローカルタイムで Date を構築しない。**

```ts
// NG: JSTの深夜0時 = UTCでは前日15:00 → 日付が1日ずれる
new Date(2026, 8, 1);

// OK: UTCで構築する
new Date(Date.UTC(2026, 8, 1));
```

`YYYY-MM` → DB は `YYYY-MM-01`。DB → `YYYY-MM` へ戻すときも `getUTCFullYear()` / `getUTCMonth()` を使う。ローカルgetterを使わない。

---

## 3. Phase 1 の既存基盤（作り直さない）

以下は実装済みである。**同等品を新規に作らず、これを使う。**

### 3.1 `src/lib/api/guard.ts`

```ts
requireSession(): Promise<SessionUser>              // 未認証 → ApiError("AUTH_REQUIRED")
requireRole(...roles): Promise<SessionUser>         // 参照系。JWTのroleで判定
requireWriteRole(...roles): Promise<SessionUser>    // 更新系。DBのusersを都度参照
```

`SessionUser` は `{ id, name?, email?, role }`。

**更新系APIは必ず `requireWriteRole` を使う**（設計差分v1.2 §6.4）。`requireRole` で代用しない。

### 3.2 `src/lib/api/response.ts`

```ts
ok<T>(data: T)                                   // { data, meta }
okList<T>(data: T[], pagination: Pagination)     // { data, pagination, meta }
fail(code, message, details?)                    // { error: { code, message, details?, requestId } }
```

`Pagination` は `{ page, pageSize, total, totalPages }`。

### 3.3 `src/lib/api/errors.ts`

- `API_ERROR_DEFINITIONS`: 全エラーコードと既定HTTPステータス・日本語メッセージ
- `ApiError(code, details?)`: `.code` / `.status` / `.details` を持つ
- `mapPrismaError(error, options?)`: P2002 / P2025 / P2034 / P2024 / P2037 を変換

Phase 2 で必要なコードはすべて定義済みである（`PROJECT_CODE_EXHAUSTED` を含む）。**新しいエラーコードを追加しない。** 必要になったら報告すること。

### 3.4 `src/lib/prisma.ts`

`PrismaPg` アダプタ経由のシングルトン。そのまま import して使う。

---

## 4. 新規に作る共通モジュール

### 4.1 `src/lib/api/handler.ts`

Route Handler の共通ラッパー。全エンドポイントがこれを通る。

責務:

1. ハンドラ本体を実行する
2. `ApiError` を捕捉 → `fail(code, message, details)` を `error.status` で返す
3. `ZodError` を捕捉 → `VALIDATION_ERROR`（400）へ変換し、§2.2 の対応で `details` を組む
4. Prisma のエラーは `mapPrismaError` を通す
5. 想定外の例外 → `INTERNAL_ERROR`（500）
6. **スタックトレース・SQL・接続文字列・例外メッセージ原文をレスポンスへ含めない**

Route Handler 内に業務処理を直接書かない。ハンドラは「認証 → 入力検証 → サービス呼び出し → レスポンス整形」だけを行う。

### 4.2 `src/lib/api/validation.ts`

- `ZodError` → `ErrorDetail[]` 変換
- `Content-Type` が `application/json` でない場合は 400
- JSON body の上限 1MiB 超過は 413

### 4.3 `src/lib/api/pagination.ts`

- `page`: 1以上、既定1
- `pageSize`: 1〜100、既定50
- 範囲外・数値でない場合は `INVALID_QUERY`（400）
- `Pagination` オブジェクトを組み立てる（`totalPages = Math.ceil(total / pageSize)`、total=0 のとき totalPages=0）

### 4.4 `src/lib/services/`

業務処理を置く。Route Handler から呼ぶ。

```text
src/lib/services/
├─ intake-service.ts
├─ project-service.ts
├─ csv-import-service.ts
├─ user-service.ts
└─ integration-status-service.ts
```

### 4.5 `src/lib/schemas/`

Zod スキーマ。リクエストボディとクエリの検証に使う。

---

## 5. 各APIの実装

基本仕様は `docs/04_API/API詳細設計書_v1.0.md` §5〜§10 に従う。以下は**そこに書かれていない確定事項と、設計差分v1.2による上書き**である。

### 5.1 確認待ち案件 API

```text
GET   /api/project-intakes
GET   /api/project-intakes/{id}
PATCH /api/project-intakes/{id}
POST  /api/project-intakes/{id}/create-project
POST  /api/project-intakes/{id}/merge
POST  /api/project-intakes/{id}/reject
```

#### 5.1.1 ソート許可リスト

`sort` は許可した値以外を `INVALID_QUERY` で拒否する。

```text
receivedAt:desc（既定） / receivedAt:asc
updatedAt:desc / updatedAt:asc
projectName:asc / projectName:desc
startMonth:asc / startMonth:desc
```

#### 5.1.2 `create-project` の project_code 採番

**設計差分v1.2 §3 に従う。** 形式は `PRJ-YYYYMMDD-NNNN`。

- 日付は**JST**での当日
- `NNNN` は当日連番、0001始まり、4桁ゼロ埋め
- 採番は Serializable トランザクション内で実行する

```ts
await prisma.$transaction(fn, { isolationLevel: "Serializable" });
```

- P2034 発生時は最大3回リトライ。3回失敗で `INTERNAL_ERROR`
- P2002（project_code重複）でも再採番リトライ（同じく最大3回）
- 当日9999件超過は `PROJECT_CODE_EXHAUSTED`（409）

トランザクション内の処理順序:

```text
1. intake を id + reviewStatus=PENDING + updatedAt 一致 で取得
2. project_code を採番
3. projects へ INSERT（createdById = 操作者）
4. project_sources.project_id を更新
5. project_intakes を REVIEWED + linkedProjectId + reviewedAt + reviewedById へ更新
```

手順5は `project_intakes_review_state_ck` 制約があるため、`linkedProjectId` / `reviewedAt` / `reviewedById` を**同時に必ず設定する**。片方だけ更新すると制約違反になる。

`projectStatus` は初期版では `OPEN` のみ許可する。

#### 5.1.3 `merge` に targetProjectUpdatedAt を必須追加

**設計差分v1.2 §5 に従う。** API詳細設計 §6.5 のリクエスト定義を上書きする。

```json
{
  "updatedAt": "...",
  "targetProjectId": "uuid",
  "targetProjectUpdatedAt": "...",
  "applyFields": ["unitPriceMinMan", "startMonth"]
}
```

- `projects` の UPDATE の WHERE に `id` + `updatedAt` + `projectStatus <> 'ARCHIVED'` を含める
- 更新件数0のとき: 対象なし→404 / ARCHIVED→409 `INVALID_STATE_TRANSITION` / updatedAt不一致→409 `OPTIMISTIC_LOCK_CONFLICT`（`details[].field = "targetProjectUpdatedAt"`）
- `applyFields` は API詳細設計 §6.5 の許可リストのみ。リスト外は `VALIDATION_ERROR`
- **`applyFields` が空配列でも**、`project_sources.project_id` の更新と intake の MERGED 化は実行する。この場合 `projects` は UPDATE しないが、`targetProjectUpdatedAt` の一致確認は行う
- 原文（`raw_text`）は変更しない

#### 5.1.4 更新不可項目

`PATCH` で以下を受け取っても無視せず、**送られてきたら `VALIDATION_ERROR`** とする。

```text
id / receptionId / lineMessageId / aiSnapshot / warningCodes
promptVersion / receivedAt / reviewStatus / linkedProjectId / rawText
```

### 5.2 正式案件 API

```text
GET   /api/projects
GET   /api/projects/{id}
PATCH /api/projects/{id}
POST  /api/projects/{id}/open
POST  /api/projects/{id}/hold
POST  /api/projects/{id}/close
POST  /api/projects/{id}/archive
```

#### 5.2.1 ソート許可リスト

```text
updatedAt:desc（既定） / updatedAt:asc
projectName:asc / projectName:desc
startMonth:asc / startMonth:desc
projectCode:asc / projectCode:desc
```

#### 5.2.2 状態遷移

API詳細設計 §7.4〜§7.7 の許可状態を厳守する。許可外は 409 `INVALID_STATE_TRANSITION`。

```text
open    : ON_HOLD / CLOSED からのみ → OPEN、archivedAt=NULL
hold    : OPEN からのみ            → ON_HOLD
close   : OPEN からのみ            → CLOSED
archive : OPEN / ON_HOLD / CLOSED  → ARCHIVED、archivedAt=現在
```

`projects_archive_state_ck` 制約があるため、`ARCHIVED` と `archivedAt` は必ず同時に整合させる。

#### 5.2.3 PATCH の条件

- `projectStatus = ARCHIVED` の案件は編集不可 → 409 `INVALID_STATE_TRANSITION`
- 更新不可項目: `projectCode` / `projectStatus` / `archivedAt` / `createdById` / `createdAt`
- `updatedById` は操作者で更新する

#### 5.2.4 詳細取得

関連原文（`project_sources`）を**受信日時降順**で返す。`linkedIntakes` には intake の処理種別（REVIEWED / MERGED）を含める。

### 5.3 CSV取込履歴 API

```text
GET /api/csv-imports
GET /api/csv-imports/{id}
```

- 参照専用。作成・更新APIは作らない（取込処理は Phase 4）
- `rawData` は **ERROR 行の詳細を要求されたときだけ**返す。一覧・通常の詳細では返さない
- 原文全文はこのAPIから返さない
- `duplicateOfImport` を詳細に含める
- ソート許可: `importedAt:desc`（既定） / `importedAt:asc` / `createdAt:desc` / `createdAt:asc`

`csv_imports.error_code` は**終了理由コード**であり、SKIPPED時は `FILE_DUPLICATE` / `ALL_ROWS_SKIPPED` が入りうる（設計差分v1.2 §1.3）。エラー扱いで表示しないこと。

### 5.4 連携状態 API

```text
GET /api/integration-status
```

レスポンス形状は API詳細設計 §9.1 に従う。

#### 5.4.1 Drive部分の扱い（Phase 2 の確定事項）

Drive Client は **Phase 4** で実装する。Phase 2 では未実装である。

`src/lib/google/drive-status.ts` に次のインターフェースを定義し、Phase 2 では**未接続を返すスタブ実装**を置く。

```ts
export type DriveStatus = {
  connected: boolean;
  inboxFiles: number | null;
  checkedAt: string;
  errorCode?: "GOOGLE_DRIVE_UNAVAILABLE";
};
```

Phase 2 のスタブは `connected: false` / `inboxFiles: null` / `errorCode: "GOOGLE_DRIVE_UNAVAILABLE"` を返す。

**これは不具合ではなく Phase 2 の仕様である。** Phase 4 でこのモジュールの実装だけを差し替える。ファイル冒頭にその旨をコメントで明記すること。

`imports` 部分（`lastImportedAt` / `errorCount` / `partialSuccessCount` / `movePendingCount`）は **DBから実際に集計して返す**。ここをスタブにしない。

API自体は Drive が未接続でも **200** を返す。

### 5.5 ユーザー管理 API

```text
GET   /api/users
POST  /api/users
PATCH /api/users/{id}
```

- **ADMIN のみ**。他ロールは 403
- `email` は trim + lowercase して保存（`users_email_lowercase_ck` 制約）
- 重複 email は 409 `DUPLICATE_RECEPTION_ID` ではなく、`mapPrismaError` の既定に任せず**明示的に扱う**。適切なコードがない場合は報告すること（新規コードを勝手に追加しない）
- **最後の有効なADMINを無効化・降格できない**。試行時は 409 `INVALID_STATE_TRANSITION`
  - 判定は「対象ユーザー以外に `role=ADMIN` かつ `isActive=true` が1人以上いるか」
  - 自分自身の降格も同じ判定に従う
- `POST` の成功は 201

---

## 6. 横断ルール

### 6.1 楽観ロックの実装パターン

更新系は**必ず**この形にする。`findUnique` して比較してから `update` する方式は競合を防げないので使わない。

```ts
const result = await prisma.projectIntake.updateMany({
  where: {
    id,
    reviewStatus: "PENDING",
    updatedAt: new Date(body.updatedAt),
  },
  data: { /* ... */ },
});

if (result.count === 0) {
  const current = await prisma.projectIntake.findUnique({
    where: { id },
    select: { reviewStatus: true },
  });
  if (!current) throw new ApiError("NOT_FOUND");
  if (current.reviewStatus !== "PENDING") {
    throw new ApiError("INTAKE_ALREADY_PROCESSED");
  }
  throw new ApiError("OPTIMISTIC_LOCK_CONFLICT", [
    { field: "updatedAt", reason: "他の利用者により更新されています。" },
  ]);
}
```

切り分け順序は API詳細設計 §6.3 のとおり **404 → 状態不正 → updatedAt不一致**。

`projects` の状態変更APIも同様に、`updatedAt` と現在状態の両方を WHERE に含める。

### 6.2 権限

API詳細設計 §4 の権限マトリクスに従う。

| 分類 | 使う関数 |
|---|---|
| 一覧・詳細の取得 | `requireRole("ADMIN","OPERATOR","VIEWER")` |
| 確認待ち編集・正式登録・統合・対象外 | `requireWriteRole("ADMIN","OPERATOR")` |
| 正式案件編集・状態変更 | `requireWriteRole("ADMIN","OPERATOR")` |
| ユーザー管理（参照含む） | `requireWriteRole("ADMIN")` |

**画面側の制御に依存しない。API単体で権限を判定する。**

### 6.3 ログ

出力してよい: `event` / `requestId` / `userId` / 対象ID / `status` / `errorCode` / `elapsedMs`

**出力禁止**: `rawText`（LINE原文）/ `aiSnapshot` 全文 / `AUTH_SECRET` / `DATABASE_URL` / スタックトレースのレスポンス混入

### 6.4 レスポンスの日時形式

ISO 8601 + `+09:00` オフセット。既存の `response.ts` の `meta.timestamp` と揃える。

月は `YYYY-MM`（§2.3 のUTC getter を使う）。

---

## 7. テスト要件

Vitest でユニットテストを書く。`@/lib/prisma` は `vi.mock` してよい。

**セクション単位で消化状況を §10 の報告に必ず書くこと。** 一部だけ実装して「積み残しなし」と書かない。

### A. 共通モジュール

1. `handler.ts`: `ApiError` が正しい status とボディへ変換される
2. `handler.ts`: `ZodError` が `VALIDATION_ERROR`(400) と `details` へ変換される
3. `handler.ts`: 想定外の例外が `INTERNAL_ERROR`(500) になり、**例外メッセージ・スタックがレスポンスに出ない**
4. `pagination.ts`: 既定値 / 範囲外 / 非数値 / totalPages の計算（total=0 を含む）
5. `validation.ts`: `path` が空配列のとき `field` を省略する

### B. 日付変換（§2.3）

6. `"2026-09"` → DB値が UTC の `2026-09-01` になる（ローカルタイムでずれない）
7. DB値 `2026-09-01` → `"2026-09"` へ戻る
8. `startMonth > endMonth` が `VALIDATION_ERROR` になる

### C. 楽観ロックと状態遷移

9. intake: `updateMany` の count=0 かつ対象なし → `NOT_FOUND`
10. intake: count=0 かつ `reviewStatus != PENDING` → `INTAKE_ALREADY_PROCESSED`
11. intake: count=0 かつ状態は PENDING → `OPTIMISTIC_LOCK_CONFLICT`
12. projects: ARCHIVED への PATCH → `INVALID_STATE_TRANSITION`
13. projects: 状態遷移の許可・不許可の全組み合わせ（open/hold/close/archive）

### D. project_code 採番（設計差分v1.2 §3）

14. 当日レコードなし → `PRJ-<JST日付>-0001`
15. 既存の最大が `0007` → `0008`
16. 9999 到達 → `PROJECT_CODE_EXHAUSTED`
17. P2002 発生時に再採番リトライし、3回失敗で `INTERNAL_ERROR`

### E. merge（設計差分v1.2 §5）

18. `targetProjectUpdatedAt` 不一致 → `OPTIMISTIC_LOCK_CONFLICT` かつ `details[].field === "targetProjectUpdatedAt"`
19. 統合先が ARCHIVED → `INVALID_STATE_TRANSITION`
20. `applyFields` が空配列でも `project_sources.project_id` 更新と MERGED 化が実行される
21. `applyFields` に許可外の項目 → `VALIDATION_ERROR`

### F. 権限

22. 参照系APIが VIEWER で成功する
23. 更新系APIが VIEWER で 403 になる
24. users API が OPERATOR で 403 になる
25. 最後の有効ADMINの降格・無効化が `INVALID_STATE_TRANSITION` になる

### G. 連携状態

26. Drive がスタブで `connected: false` でも API は 200 を返す
27. `imports` 部分がDBの集計値を返す（スタブでない）

---

## 8. 禁止事項

1. `prisma/schema.prisma` の `model` / `enum` / インデックス定義を変更する
2. `prisma db push` を使う / マイグレーションなしでDBを変更する
3. Phase 3以降の画面・CSV取込・LINE・内部Cron APIを実装する
4. 既存の `guard.ts` / `response.ts` / `errors.ts` / `prisma.ts` と同等品を新規に作る
5. 新しいエラーコードを `errors.ts` へ勝手に追加する（必要なら報告する）
6. 更新系APIで `requireWriteRole` ではなく `requireRole` を使う
7. `findUnique` → 比較 → `update` の順で楽観ロックを実装する（競合を防げない）
8. ソート・フィルタのキーを許可リストなしで受け付ける
9. Route Handler 内に業務処理を直接書く
10. `params` を `await` せずに使う
11. 日付を `new Date(y, m, d)`（ローカルタイム）で構築する
12. レスポンスにスタックトレース・SQL・例外メッセージ原文を含める
13. ログへ `rawText` / `aiSnapshot` 全文 / 秘密値を出力する
14. `any` で型エラーを回避する
15. 依存パッケージを追加する（必要なら理由を報告する）
16. 設計書にない仕様を推測で実装する

---

## 9. 完了条件

**すべて実際に実行し、結果を報告する。「通るはず」は不可。**

| # | 確認 | 期待 |
|---:|---|---|
| 1 | `npm run lint` | エラー0 |
| 2 | `npm run typecheck` | エラー0 |
| 3 | `npm run build` | 成功 |
| 4 | `npm run test` | 全件成功。§7 A〜G を網羅 |
| 5 | `docker build .` | 成功 |
| 6 | 19エンドポイントの存在確認 | §1.1 の全ルートが解決する |
| 7 | 未認証で各APIを呼ぶ | 401 JSON（リダイレクトしない） |
| 8 | VIEWER で更新系APIを呼ぶ | 403 |
| 9 | OPERATOR で users API を呼ぶ | 403 |
| 10 | `GET /api/integration-status` | 200 かつ `drive.connected=false` |
| 11 | `git grep` で秘密値 | 検出0件 |
| 12 | テーブル数 | **7のまま**（増えていないこと） |

### 9.1 手動での疎通確認

ローカルDBへ検証用データを投入し、少なくとも以下を実機で確認する。

- 確認待ち一覧の取得とページング
- 確認待ち詳細で `source.rawText` と `aiSnapshot` が返る
- PATCH による保存と、古い `updatedAt` を送った場合の 409
- 正式案件登録で `project_code` が `PRJ-YYYYMMDD-0001` 形式になる
- 同一 intake への二重の正式登録が 409 になる

投入したデータは検証後に削除し、残存0件を確認すること。

---

## 10. 報告フォーマット

```text
## 実装したファイル
（パス一覧）

## §7 テスト要件の消化状況
A 共通モジュール      : 実装 / 一部（内訳） / 未実装
B 日付変換            : 〃
C 楽観ロックと状態遷移 : 〃
D project_code採番    : 〃
E merge               : 〃
F 権限                : 〃
G 連携状態            : 〃

一部・未実装がある場合は、項目番号と理由を明記すること。

## §9 完了条件の実行結果
（#1〜#12 それぞれの実結果。失敗したものは失敗と書く）

## 設計と異なる判断をした箇所
（なければ「なし」）

## 未実装・積み残し
（Phase 3以降へ送ったもの）

## 判断を仰ぎたい点
（設計書に答えがなく、推測を避けた事項）
```

失敗した項目を「成功」と報告しない。落ちたテストは落ちたと書く。

---

## 11. 作業手順

```text
1. 最新の main から feature/phase2-api を作成
2. 本書 §4 → §5 の順に実装
3. §7 のテストを A〜G すべて実装
4. §9 の完了条件を全項目実行
5. 意味のある単位で複数コミット
6. main 向け Pull Request を作成
```

PR本文に §10 の報告内容を含める。**main へ直接pushしない。**
