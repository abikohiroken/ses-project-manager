# SES案件管理WEBアプリ API詳細設計書
## Version 1.0

基準:

- 基本設計 v2.4
- 基本設計 v2.5差分
- DB・Prisma詳細設計 v1.1
- CSV・Google Drive取込詳細設計 v1.0

---

## 1. API基本方針

### 1.1 実装方式
Next.js App RouterのRoute Handlersを使用する。

```text
src/app/api/**/route.ts
```

### 1.2 ベースURL

```text
https://<APP_DOMAIN>/api
```

### 1.3 形式
- Request: `application/json`
- Response: `application/json`
- 日時: ISO 8601、タイムゾーン付き
- 月: `YYYY-MM`
- ID: UUIDまたは業務ID
- 文字コード: UTF-8

### 1.4 認証
- WEB画面API: Auth.jsセッション
- LINE Webhook: `x-line-signature`
- Cron内部API: `Authorization: Bearer <CRON_SECRET>`
- Health Check: 認証不要

### 1.5 ロール
- ADMIN
- OPERATOR
- VIEWER

---

## 2. 共通レスポンス

### 2.1 単一データ成功

```json
{
  "data": {},
  "meta": {
    "requestId": "REQ-9e5a4e36",
    "timestamp": "2026-08-05T15:30:00+09:00"
  }
}
```

### 2.2 一覧成功

```json
{
  "data": [],
  "pagination": {
    "page": 1,
    "pageSize": 50,
    "total": 125,
    "totalPages": 3
  },
  "meta": {
    "requestId": "REQ-9e5a4e36",
    "timestamp": "2026-08-05T15:30:00+09:00"
  }
}
```

### 2.3 エラー

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "入力値を確認してください。",
    "details": [
      {
        "field": "unitPriceMinMan",
        "reason": "0以上の整数を指定してください。"
      }
    ],
    "requestId": "REQ-9e5a4e36"
  }
}
```

### 2.4 HTTPステータス

| HTTP | 用途 |
|---:|---|
| 200 | 取得・更新成功 |
| 201 | 新規作成成功 |
| 204 | レスポンス本文なし |
| 400 | 入力形式・値不正 |
| 401 | 未認証・署名不正・Cron秘密不正 |
| 403 | 権限不足 |
| 404 | 対象なし |
| 409 | 状態競合・重複・更新競合 |
| 413 | サイズ上限超過 |
| 429 | レート制限 |
| 500 | 内部エラー |
| 503 | DB・Google API等の依存先利用不可 |

---

## 3. 共通エラーコード

| コード | HTTP | 内容 |
|---|---:|---|
| AUTH_REQUIRED | 401 | ログインが必要 |
| INVALID_LINE_SIGNATURE | 401 | LINE署名不正 |
| INVALID_CRON_SECRET | 401 | Cron秘密不正 |
| FORBIDDEN | 403 | 権限不足 |
| NOT_FOUND | 404 | 対象なし |
| VALIDATION_ERROR | 400 | 入力値不正 |
| INVALID_QUERY | 400 | 検索条件不正 |
| INTAKE_ALREADY_PROCESSED | 409 | 確認待ち案件が処理済み |
| OPTIMISTIC_LOCK_CONFLICT | 409 | updatedAt不一致 |
| INVALID_STATE_TRANSITION | 409 | 状態遷移不正 |
| DUPLICATE_RECEPTION_ID | 409 | reception_id重複 |
| DUPLICATE_LINE_MESSAGE_ID | 409 | LINEメッセージID重複 |
| DUPLICATE_DRIVE_FILE | 409 | Driveファイル重複 |
| DUPLICATE_FILE_HASH | 409 | 同一CSV内容 |
| DATABASE_UNAVAILABLE | 503 | DB利用不可 |
| GOOGLE_SHEETS_UNAVAILABLE | 503 | Sheets API利用不可 |
| GOOGLE_DRIVE_UNAVAILABLE | 503 | Drive API利用不可 |
| INTERNAL_ERROR | 500 | 想定外エラー |

Prismaエラー変換:

| Prisma | API |
|---|---|
| P2002 | 対象の一意制約に応じた409 |
| P2025 | 404 |
| P2034 | 最大3回再試行後409または503 |
| P2024 / P2037 | 503 |
| その他 | 500 |

---

## 4. 権限マトリクス

| API分類 | ADMIN | OPERATOR | VIEWER | 未認証 |
|---|---:|---:|---:|---:|
| 確認待ち一覧・詳細 | ○ | ○ | ○ | × |
| 確認待ち編集 | ○ | ○ | × | × |
| 正式登録・統合・対象外 | ○ | ○ | × | × |
| 正式案件一覧・詳細 | ○ | ○ | ○ | × |
| 正式案件編集・状態変更 | ○ | ○ | × | × |
| CSV取込履歴 | ○ | ○ | ○ | × |
| ユーザー管理 | ○ | × | × | × |
| 連携状態 | ○ | ○ | ○ | × |
| LINE Webhook | 署名 | 署名 | 署名 | 署名 |
| Cron内部API | Secret | Secret | Secret | Secret |
| Health | ○ | ○ | ○ | ○ |

---

## 5. LINE Webhook

### 5.1 POST `/api/webhooks/line`

#### 認証
`x-line-signature`を使用する。

#### 必須処理順
1. Request bodyを文字列のまま取得
2. bodyを変更せずHMAC-SHA256署名検証
3. 検証成功後にJSON parse
4. text message eventだけを処理
5. settingsシートで送信元許可を確認
6. raw_inboxへ追記
7. 200を返す

署名検証前にJSON parse、改行変換、文字列置換を行わない。

#### 対象イベント
- `event.type = message`
- `event.message.type = text`
- `source.type = user`または`group`

その他は処理せず200。

#### raw_inbox重複
`line_message_id`が既に存在する場合は追記せず200。

#### 成功レスポンス

```json
{
  "received": true
}
```

#### エラー
- 署名不正: 401
- Sheets API失敗: 503
- JSON不正: 400

#### 備考
LINEへのレスポンスには内部エラー詳細を含めない。

---

## 6. 確認待ち案件API

### 6.1 GET `/api/project-intakes`

#### 権限
ADMIN / OPERATOR / VIEWER

#### Query

| パラメータ | 型 | 初期値 | 内容 |
|---|---|---:|---|
| page | integer | 1 | 1以上 |
| pageSize | integer | 50 | 1～100 |
| reviewStatus | enum | PENDING | PENDING等 |
| q | string | - | 案件名部分一致 |
| hasWarning | boolean | - | 警告有無 |
| sourceCompany | string | - | 送信元会社 |
| receivedFrom | datetime | - | 受信日時下限 |
| receivedTo | datetime | - | 受信日時上限 |
| startMonth | YYYY-MM | - | 開始月 |
| sort | string | receivedAt:desc | 許可済みソートだけ |

#### 一覧項目

```json
{
  "id": "uuid",
  "receptionId": "RCP-...",
  "projectName": "案件名",
  "unitPriceMinMan": 60,
  "unitPriceMaxMan": 70,
  "startMonth": "2026-09",
  "location": "品川",
  "warningCodes": [],
  "reviewStatus": "PENDING",
  "sourceCompany": "株式会社サンプル",
  "receivedAt": "2026-08-05T14:20:30+09:00",
  "updatedAt": "2026-08-05T15:00:00+09:00"
}
```

---

### 6.2 GET `/api/project-intakes/{id}`

#### 権限
ADMIN / OPERATOR / VIEWER

#### Response
- 編集可能な現在値
- `aiSnapshot`
- `warningCodes`
- `source.rawText`
- `sourceCompany`
- `sourceContact`
- `receivedAt`
- `linkedProject`
- `updatedAt`

VIEWERでも原文を閲覧可能。

---

### 6.3 PATCH `/api/project-intakes/{id}`

#### 権限
ADMIN / OPERATOR

#### Request

```json
{
  "updatedAt": "2026-08-05T15:00:00.000Z",
  "projectName": "販売管理システム改修",
  "projectSummary": "既存システム改修",
  "requiredSkills": ["Java", "Spring Boot"],
  "preferredSkills": ["AWS"],
  "role": "バックエンドエンジニア",
  "process": "基本設計～結合テスト",
  "unitPriceMinMan": 60,
  "unitPriceMaxMan": 70,
  "settlementRange": "140-180",
  "startMonth": "2026-09",
  "endMonth": null,
  "workDaysPerWeek": 5,
  "location": "品川",
  "nearestStation": "品川駅",
  "remoteStyle": "hybrid",
  "remoteNote": "週3日リモート",
  "recruitmentCount": 2,
  "commercialFlow": "エンド→元請→当社",
  "interviewCount": 2,
  "foreignerAllowed": "not_allowed",
  "ageLimit": "45歳まで",
  "nationalityNote": null,
  "employmentCondition": "当社まで"
}
```

#### 更新不可
- id
- receptionId
- lineMessageId
- aiSnapshot
- warningCodes
- promptVersion
- receivedAt
- reviewStatus
- linkedProjectId
- source.rawText

#### 条件
- `reviewStatus = PENDING`
- `updatedAt`一致

#### Transaction
単一UPDATE。`updatedAt`と状態をWHERE条件に含める。

#### Conflict
更新件数0の場合:
1. 対象なしなら404
2. PENDING以外なら`INTAKE_ALREADY_PROCESSED`
3. updatedAt不一致なら`OPTIMISTIC_LOCK_CONFLICT`

---

### 6.4 POST `/api/project-intakes/{id}/create-project`

#### 権限
ADMIN / OPERATOR

#### Request

```json
{
  "updatedAt": "2026-08-05T15:00:00.000Z",
  "projectStatus": "OPEN"
}
```

初期版では`projectStatus`は`OPEN`のみ許可する。

#### 必須
- projectNameが空白ではない
- reviewStatus=PENDING
- updatedAt一致

#### Transaction
Serializable、P2034時最大3回再試行。

```text
project_intakes取得
projects作成
project_sources.project_id更新
project_intakesをREVIEWEDへ更新
```

#### Response
201、作成した正式案件。

---

### 6.5 POST `/api/project-intakes/{id}/merge`

#### 権限
ADMIN / OPERATOR

#### Request

```json
{
  "updatedAt": "2026-08-05T15:00:00.000Z",
  "targetProjectId": "uuid",
  "applyFields": [
    "unitPriceMinMan",
    "unitPriceMaxMan",
    "startMonth",
    "location"
  ]
}
```

`applyFields`は許可リスト方式。

許可:
- projectName
- projectSummary
- requiredSkills
- preferredSkills
- role
- process
- unitPriceMinMan
- unitPriceMaxMan
- settlementRange
- startMonth
- endMonth
- workDaysPerWeek
- location
- nearestStation
- remoteStyle
- remoteNote
- recruitmentCount
- commercialFlow
- interviewCount
- foreignerAllowed
- ageLimit
- nationalityNote
- employmentCondition

#### Transaction

```text
intakeをPENDING条件で取得
target project存在確認
applyFieldsだけprojects更新
project_sources.project_id更新
intakeをMERGEDへ更新
```

原文は変更しない。

---

### 6.6 POST `/api/project-intakes/{id}/reject`

#### 権限
ADMIN / OPERATOR

#### Request

```json
{
  "updatedAt": "2026-08-05T15:00:00.000Z"
}
```

#### Transaction
PENDING条件でREJECTED、reviewedAt、reviewedByIdを更新。

---

## 7. 正式案件API

### 7.1 GET `/api/projects`

#### 権限
ADMIN / OPERATOR / VIEWER

#### Query
- page
- pageSize
- q
- projectStatus
- startMonth
- location
- requiredSkill
- preferredSkill
- sort

#### 一覧項目
- id
- projectCode
- projectName
- projectStatus
- requiredSkills
- unitPriceMinMan
- unitPriceMaxMan
- startMonth
- location
- remoteStyle
- updatedAt

---

### 7.2 GET `/api/projects/{id}`

#### 権限
ADMIN / OPERATOR / VIEWER

#### Response
- 正式案件全項目
- 関連原文一覧
- linkedIntakes
- createdBy
- updatedBy
- updatedAt

原文は受信日時降順。

---

### 7.3 PATCH `/api/projects/{id}`

#### 権限
ADMIN / OPERATOR

#### Request
確認待ち編集と同じ業務項目に`updatedAt`を追加。

#### 更新不可
- projectCode
- projectStatus
- archivedAt
- createdById
- createdAt

#### 条件
- ARCHIVED以外
- updatedAt一致

---

### 7.4 POST `/api/projects/{id}/open`
許可状態:
- ON_HOLD
- CLOSED

更新:
- projectStatus=OPEN
- archivedAt=NULL
- updatedById

### 7.5 POST `/api/projects/{id}/hold`
許可状態:
- OPEN

更新:
- projectStatus=ON_HOLD

### 7.6 POST `/api/projects/{id}/close`
許可状態:
- OPEN

更新:
- projectStatus=CLOSED

### 7.7 POST `/api/projects/{id}/archive`
許可状態:
- OPEN
- ON_HOLD
- CLOSED

更新:
- projectStatus=ARCHIVED
- archivedAt=現在

各状態API Request:

```json
{
  "updatedAt": "2026-08-05T15:00:00.000Z"
}
```

状態とupdatedAtをWHERE条件に含める。

---

## 8. CSV取込履歴API

### 8.1 GET `/api/csv-imports`

#### 権限
ADMIN / OPERATOR / VIEWER

#### Query
- page
- pageSize
- status
- driveMoveStatus
- fileName
- batchId
- importedFrom
- importedTo

#### 一覧項目
- id
- fileName
- batchId
- status
- driveMoveStatus
- totalRows
- successRows
- failedRows
- skippedRows
- importedAt
- errorCode

---

### 8.2 GET `/api/csv-imports/{id}`

#### 権限
ADMIN / OPERATOR / VIEWER

#### Response
- ファイル情報
- 件数
- エラー
- duplicateOfImport
- 行結果一覧

`rawData`はERROR行の詳細を開いた場合だけ返す。

---

## 9. 連携状態API

### 9.1 GET `/api/integration-status`

#### 権限
ADMIN / OPERATOR / VIEWER

#### Response

```json
{
  "data": {
    "drive": {
      "connected": true,
      "inboxFiles": 2,
      "checkedAt": "2026-08-05T15:30:00+09:00"
    },
    "imports": {
      "lastImportedAt": "2026-08-05T15:01:00+09:00",
      "errorCount": 1,
      "partialSuccessCount": 0,
      "movePendingCount": 0
    }
  }
}
```

Drive APIが失敗してもAPI自体は200とし、`connected=false`とエラーコードを返す。

---

## 10. ユーザーAPI

### 10.1 GET `/api/users`
ADMINのみ。

### 10.2 POST `/api/users`

```json
{
  "email": "user@example.com",
  "name": "田中",
  "role": "OPERATOR"
}
```

- emailはtrim・lowercase
- 201
- 重複時409

### 10.3 PATCH `/api/users/{id}`

```json
{
  "name": "田中",
  "role": "VIEWER",
  "isActive": true,
  "updatedAt": "2026-08-05T15:00:00.000Z"
}
```

最後の有効ADMINを無効化・降格させない。

---

## 11. 内部API

### 11.1 POST `/api/internal/google-drive-import`
- Bearer CRON_SECRET
- Drive取込処理を1回実行
- 個別ファイルERRORを含んでも200
- Drive一覧取得不能・DB接続不能は503

### 11.2 POST `/api/internal/drive-move-retry`
- Bearer CRON_SECRET
- MOVE_PENDINGを最大10件再試行

### 11.3 POST `/api/internal/import-reconcile`
- Bearer CRON_SECRET
- 2時間以上残留するPROCESSINGを修復

内部処理は共通サービス関数を呼ぶ。Route Handler内に業務処理を直接記述しない。

---

## 12. Health API

### 12.1 GET `/api/health`

Response 200:

```json
{
  "status": "ok"
}
```

DB接続不能時は503:

```json
{
  "status": "unavailable"
}
```

秘密情報や内部構成を返さない。

---

## 13. セキュリティ

- JSON body上限: 通常API 1MiB
- LINE Webhook body上限: 1MiB
- Content-Type不正は400
- Origin/CSRF対策
- 認証済み更新APIへサーバー側RBAC
- 原文をHTMLとして返しても、画面側はtextとして描画
- APIログへrawText、aiSnapshot全文を出力しない
- エラーのstack traceをレスポンスへ含めない
- Webhook署名比較はタイミング攻撃に配慮した比較を使用

---

## 14. OpenAPI

実装用のOpenAPI定義は以下を成果物とする。

```text
openapi_v1.yaml
```

OpenAPIは認証・全フィールドの概要を示し、DB制約や状態遷移の最終仕様は本詳細設計書を正とする。
