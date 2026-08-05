# SES案件管理WEBアプリ CSV仕様・Google Drive取込処理 詳細設計書
## Version 1.0

基本設計: **SES案件管理WEBアプリ 基本設計書 v2.4**  
DB設計: **DB・Prisma詳細設計 v1.1**

---

## 1. 設計目的

本書では、Googleスプレッドシートで構造化された案件をGoogle Apps ScriptでCSV化し、Google Driveを経由してWEBアプリへ取り込む処理を確定する。

対象:

- CSVファイル仕様
- CSV列と値形式
- GASのCSV生成処理
- Google Driveフォルダ
- Drive APIの利用方法
- 30分Cron
- ファイル・行バリデーション
- `project_intakes`への登録
- 重複防止
- 部分成功
- ファイル移動
- 障害復旧
- エラーコード
- テスト条件

---

## 2. 詳細化による確定・修正事項

### 2.1 CSVへ送信元LINE IDを追加
`project_sources`へ保存するため、基本設計のCSV列へ以下を追加する。

- `line_user_id`
- `line_group_id`

新しい画面や機能の追加ではなく、受信元情報をDBまで欠落なく運ぶための項目追加である。

### 2.2 csv_importsのDB修正
エラーファイルと重複ファイルの履歴を正しく保存するため、DB詳細設計をv1.1へ修正する。

- `file_hash`: NULL許容、非一意
- `schema_version`: NULL許容
- `batch_id`: NULL許容
- `duplicate_of_import_id`: 追加
- `drive_file_id`: 一意を維持

詳細は`DB-Prisma詳細設計_v1.1差分.md`を参照する。

---

## 3. Google Drive構成

### 3.1 ルートフォルダ

```text
SES営業システム
```

Google DriveフォルダID:

```text
1TlsmeCDe2PK-S9dWRaRVTtpTq5Pty7IE
```

### 3.2 配下構成

```text
SES営業システム/
├─ inbox/
├─ processed/
├─ error/
└─ SES案件取込管理スプレッドシート
```

### 3.3 用途

| フォルダ | 用途 |
|---|---|
| inbox | GASが作成した未取込CSV |
| processed | SUCCESS、PARTIAL_SUCCESS、SKIPPED |
| error | ファイル全体ERROR、または正常行が0件の行エラーCSV |

### 3.4 処理中状態
`processing`フォルダは作成しない。

処理中状態は以下で管理する。

```text
csv_imports.status = PROCESSING
```

---

## 4. Google Drive認証

### 4.1 WEBアプリ
WEBアプリはGoogle Cloudのサービスアカウントを使用する。

サービスアカウントのメールアドレスを`SES営業システム`フォルダへ編集者として共有する。

### 4.2 OAuth Scope

```text
https://www.googleapis.com/auth/drive
```

対象フォルダだけをサービスアカウントへ共有し、アプリケーション側でもフォルダIDを固定する。

### 4.3 環境変数

```env
GOOGLE_PROJECT_ID=
GOOGLE_CLIENT_EMAIL=
GOOGLE_PRIVATE_KEY=

GOOGLE_DRIVE_ROOT_FOLDER_ID=1TlsmeCDe2PK-S9dWRaRVTtpTq5Pty7IE
GOOGLE_DRIVE_INBOX_FOLDER_ID=
GOOGLE_DRIVE_PROCESSED_FOLDER_ID=
GOOGLE_DRIVE_ERROR_FOLDER_ID=

CRON_SECRET=
CSV_SCHEMA_VERSION=v1
```

### 4.4 秘密鍵
- Dokployの環境変数へ保存する
- GitHubへ保存しない
- 改行を含む秘密鍵は起動時に復元する
- ログへ出力しない

---

## 5. CSVファイル名

### 5.1 形式

```text
ses_projects_<schema_version>_<batch_id>.csv
```

### 5.2 正規表現

```regex
^ses_projects_(v[1-9][0-9]*)_(BATCH-\d{8}-\d{6}-[A-Z0-9]{6})\.csv$
```

### 5.3 例

```text
ses_projects_v1_BATCH-20260805-183000-A1B2C3.csv
```

### 5.4 batch_id

```text
BATCH-YYYYMMDD-HHMMSS-XXXXXX
```

- 時刻はJST
- 末尾6文字は大文字英数字
- 同一batch_idを再利用しない
- `export_batches.batch_id`を一意とする

---

## 6. CSVファイル仕様

| 項目 | 仕様 |
|---|---|
| 拡張子 | `.csv` |
| 文字コード | UTF-8 BOM付き |
| 区切り | カンマ |
| レコード区切り | CRLF |
| ヘッダー | 1行目必須 |
| データ | 1案件1行 |
| 引用符 | 全セルをダブルクォートで囲む |
| ダブルクォート | `""`へエスケープ |
| セル内改行 | 許可 |
| 最大行数 | 1,000行、ヘッダー除外 |
| 最大ファイルサイズ | 10MiB |
| GAS生成目標 | 9MiB以下 |
| 空ファイル | 不可 |
| raw_text | 1～50,000文字 |

### 6.1 全セル引用
GASは空欄を含むすべてのセルをダブルクォートで囲む。

例:

```csv
"RCP-001","LINE-001","","","案件名"
```

### 6.2 raw_text
- 前後空白を削除しない
- 改行を保持する
- HTMLとして解釈しない
- NUL文字は許可しない
- 50,000文字を超える場合は行エラー

---

## 7. CSV列順

列数は**33列固定**とする。

| No. | CSV列 | 必須 | 型・形式 | 最大 | DB保存先 |
|---:|---|---:|---|---:|---|
| 1 | reception_id | ○ | 文字列 | 64 | project_intakes / project_sources |
| 2 | line_message_id | ○ | 文字列 | 128 | project_intakes / project_sources |
| 3 | line_user_id |  | 文字列 | 128 | project_sources |
| 4 | line_group_id |  | 文字列 | 128 | project_sources |
| 5 | project_name |  | 文字列 | 255 | project_intakes |
| 6 | project_summary |  | 文字列 | 制限なし | project_intakes |
| 7 | required_skills | ○ | JSON文字列配列 | - | project_intakes |
| 8 | preferred_skills | ○ | JSON文字列配列 | - | project_intakes |
| 9 | role |  | 文字列 | 100 | project_intakes |
| 10 | process |  | 文字列 | 255 | project_intakes |
| 11 | unit_price_min_man |  | 0以上の整数 | - | project_intakes |
| 12 | unit_price_max_man |  | 0以上の整数 | - | project_intakes |
| 13 | settlement_range |  | 文字列 | 100 | project_intakes |
| 14 | start_month |  | `YYYY-MM` | 7 | project_intakes |
| 15 | end_month |  | `YYYY-MM` | 7 | project_intakes |
| 16 | work_days_per_week |  | 1～7の整数 | - | project_intakes |
| 17 | location |  | 文字列 | 255 | project_intakes |
| 18 | nearest_station |  | 文字列 | 255 | project_intakes |
| 19 | remote_style |  | 定義コード | 32 | project_intakes |
| 20 | remote_note |  | 文字列 | 制限なし | project_intakes |
| 21 | recruitment_count |  | 1以上の整数 | - | project_intakes |
| 22 | commercial_flow |  | 文字列 | 制限なし | project_intakes |
| 23 | interview_count |  | 0以上の整数 | - | project_intakes |
| 24 | foreigner_allowed |  | 定義コード | 32 | project_intakes |
| 25 | age_limit |  | 文字列 | 100 | project_intakes |
| 26 | nationality_note |  | 文字列 | 制限なし | project_intakes |
| 27 | employment_condition |  | 文字列 | 制限なし | project_intakes |
| 28 | source_company |  | 文字列 | 255 | project_sources |
| 29 | source_contact |  | 文字列 | 100 | project_sources |
| 30 | received_at | ○ | ISO 8601、タイムゾーン必須 | - | project_intakes / project_sources |
| 31 | raw_text | ○ | 原文 | 50,000 | project_sources |
| 32 | warning_codes | ○ | JSON文字列配列 | - | project_intakes |
| 33 | prompt_version | ○ | 文字列 | 64 | project_intakes / export_batches |

### 7.1 正式ヘッダー

```text
reception_id
line_message_id
line_user_id
line_group_id
project_name
project_summary
required_skills
preferred_skills
role
process
unit_price_min_man
unit_price_max_man
settlement_range
start_month
end_month
work_days_per_week
location
nearest_station
remote_style
remote_note
recruitment_count
commercial_flow
interview_count
foreigner_allowed
age_limit
nationality_note
employment_condition
source_company
source_contact
received_at
raw_text
warning_codes
prompt_version
```

順序を含めて完全一致とする。

---

## 8. 値形式

### 8.1 空欄
以下は空文字をNULLへ変換する。

- 任意文字列
- 任意整数
- 任意年月
- line_user_id
- line_group_id

以下は空文字を許可しない。

- reception_id
- line_message_id
- required_skills
- preferred_skills
- received_at
- raw_text
- warning_codes
- prompt_version

### 8.2 JSON配列

#### required_skills

```json
["Java","Spring Boot","SQL"]
```

#### preferred_skills

```json
[]
```

#### warning_codes

```json
["PRICE_AMBIGUOUS","START_MONTH_AMBIGUOUS"]
```

条件:

- JSONとして解析できる
- 配列である
- 全要素が文字列
- 空要素を除去する
- 前後空白を除去する
- 同一文字列の重複を除去する
- 元の順番を維持する

### 8.3 remote_style

| 値 | 内容 |
|---|---|
| full | フルリモート |
| hybrid | 併用 |
| onsite | 常駐 |
| unknown | 不明 |

空欄も許可するが、ChatGPT出力では原則`unknown`を使用する。

### 8.4 foreigner_allowed

| 値 | 内容 |
|---|---|
| allowed | 可 |
| not_allowed | 不可 |
| conditional | 条件付き |
| unknown | 不明 |

### 8.5 日付
`received_at`:

```text
2026-08-05T14:20:30+09:00
```

- ISO 8601
- タイムゾーン必須
- PostgreSQLへ`timestamptz`で保存する

### 8.6 年月
`start_month`、`end_month`:

```text
2026-09
```

DB保存時:

```text
2026-09-01
```

### 8.7 単価
万円整数。

```text
60万円 → 60
60.5万円 → 行エラー
```

### 8.8 自由記述
`project_summary`等の自由記述は前後空白を除去する。

`raw_text`だけは前後空白・改行を変更しない。

---

## 9. GAS CSV生成処理

### 9.1 実行
30分ごとの時間主導型トリガー。

### 9.2 排他制御

```javascript
const lock = LockService.getScriptLock();
lock.waitLock(30000);

try {
  // CSV生成
  SpreadsheetApp.flush();
} finally {
  lock.releaseLock();
}
```

### 9.3 対象

```text
structured_projects.export_status = WAITING
```

### 9.4 グループ分割
異なる`prompt_version`を同一CSVへ混在させない。

処理順:

1. WAITINGを取得
2. prompt_versionごとに分類
3. 受信日時の古い順に並べる
4. 最大1,000件で分割
5. UTF-8 BOM込みの推定サイズが9MiBを超える前に分割

### 9.5 バッチ生成
各CSVごとにbatch_idを発行する。

対象行を以下へ更新する。

```text
export_status = RESERVED
batch_id = 発行したbatch_id
```

### 9.6 CSV作成
- 正式ヘッダー順に並べる
- 全セルを引用する
- CRLFを使用する
- UTF-8 BOMを付ける
- MIMEタイプは`text/csv`
- inboxへ直接作成する

### 9.7 作成成功
- export_batchesへ記録
- 対象行を`EXPORTED`
- exported_atを設定

### 9.8 作成失敗
- 対象行を`WAITING`へ戻す
- export_batchesを`ERROR`
- error_messageを保存
- 次回トリガーで再処理可能にする

### 9.9 GAS冪等性
CSV作成前にbatch_idを確定する。

同一batch_idのファイルがinbox、processed、errorのいずれかに存在する場合:

- 新しいCSVを作らない
- 既存DriveファイルIDを取得
- スプレッドシートの状態だけ修復する

---

## 10. Driveファイル一覧取得

### 10.1 Cron

```cron
*/30 * * * *
```

内部API:

```http
POST /api/internal/google-drive-import
Authorization: Bearer <CRON_SECRET>
```

### 10.2 1回の上限

```text
最大10ファイル
または
最大5分
```

先に到達した時点で終了する。

### 10.3 files.list相当

検索条件:

```text
'<INBOX_FOLDER_ID>' in parents
and trashed = false
```

取得フィールド:

```text
id
name
mimeType
size
createdTime
modifiedTime
parents
```

並び順:

```text
createdTime asc, name asc
```

取得件数:

```text
pageSize = 10
```

### 10.4 対象判定
一覧取得後、アプリ側で以下を確認する。

- `.csv`拡張子
- ファイル名正規表現
- フォルダではない
- サイズ情報が存在する
- 最大10MiB以下

MIMEタイプは`text/csv`を期待するが、ファイル名と内容検証を主判定とする。

---

## 11. 取込処理順序

Cronは次の順序で処理する。

### 11.1 MOVE_PENDING再試行
`drive_move_status=MOVE_PENDING`を古い順に最大10件処理する。

成功:

```text
drive_move_status = MOVED
```

失敗:

```text
attempt_count += 1
```

5回失敗:

```text
drive_move_status = ERROR
```

### 11.2 PROCESSING残留修復
以下を検索する。

```text
status = PROCESSING
processing_started_at < 現在 - 2時間
```

処理:

- 行登録が完了済み: ファイル移動処理へ進む
- 行登録が未完了: `attempt_count += 1`して再処理
- 5回失敗: status=ERROR

### 11.3 新規ファイル
残り時間と残りファイル上限の範囲でinboxを処理する。

---

## 12. 1ファイルの処理

### 12.1 既存drive_file_id確認
`csv_imports.drive_file_id`を検索する。

#### 存在しない
新規取込へ進む。

#### 存在する
- MOVE_PENDING: 移動だけ再試行
- PROCESSINGかつ2時間未満: スキップ
- 終了状態かつMOVED: 何もしない
- PROCESSINGかつ2時間以上: 残留修復

### 12.2 ファイル名解析
正規表現から以下を抽出する。

- schema_version
- batch_id

失敗した場合:

- csv_importsをERRORで作成
- schema_version=NULL
- batch_id=NULL
- error_code=INVALID_FILE_NAME
- errorへ移動

### 12.3 サイズ検証
Driveメタデータのsizeが10MiBを超える場合:

- ダウンロードしない
- file_hash=NULL
- status=ERROR
- error_code=FILE_TOO_LARGE
- errorへ移動

### 12.4 ダウンロード
CSVはDriveのバイナリファイルとしてダウンロードする。

失敗時:

- status=ERROR
- error_code=DRIVE_DOWNLOAD_FAILED
- errorへ移動を試行

### 12.5 SHA-256
ダウンロードした全バイトから小文字16進64桁のSHA-256を算出する。

### 12.6 同一内容確認
同じfile_hashを持つ以下の既存取込を検索する。

```text
status IN (SUCCESS, PARTIAL_SUCCESS, SKIPPED)
```

存在する場合:

- 新しいcsv_importsをSKIPPEDで作成
- duplicate_of_import_idを設定
- total_rows=0
- imported_at=現在
- processedへ移動

ERRORの同一ハッシュしか存在しない場合は再処理を許可する。

### 12.7 csv_imports作成

```text
status = PROCESSING
drive_move_status = PENDING
attempt_count = 1
processing_started_at = 現在
```

---

## 13. ファイルバリデーション

順序を固定する。

1. ファイル名
2. サイズ
3. ダウンロード
4. UTF-8 BOM
5. CSV構文
6. ヘッダー
7. 行数
8. prompt_version統一
9. 行バリデーション

### 13.1 UTF-8 BOM
先頭3バイトが以下であること。

```text
EF BB BF
```

存在しない場合:

```text
INVALID_UTF8_BOM
```

### 13.2 CSV構文
RFC 4180相当のライブラリを使用する。

独自の`split(",")`は禁止。

### 13.3 ヘッダー
- 33列
- 列順完全一致
- Unicode NFC正規化後に比較
- 重複ヘッダー不可
- 不明列不可

### 13.4 行数
- 0件: EMPTY_FILE
- 1,001件以上: ROW_LIMIT_EXCEEDED

### 13.5 prompt_version
全行で同一であること。

異なる値が含まれる場合:

```text
MIXED_PROMPT_VERSION
```

### 13.6 ExportBatch登録
ファイル検証後、以下を`export_batches`へupsertする。

- batch_id
- schema_version
- prompt_version
- file_name
- drive_file_id
- target_count
- status=CREATED
- generated_at=Drive createdTime

GASはDBへ直接接続しないため、WEBアプリがCSV受信時にバッチ履歴をDBへ再構成する。

---

## 14. 行バリデーション

### 14.1 必須
- reception_id
- line_message_id
- received_at
- raw_text
- prompt_version
- required_skills
- preferred_skills
- warning_codes

### 14.2 同一CSV内重複
最初の行を処理対象とし、2件目以降をERRORにする。

確認対象:

- reception_id
- line_message_id

エラー:

```text
DUPLICATE_ID_IN_FILE
```

### 14.3 DB既存確認

#### reception_idとline_message_idが同じ既存intakeを指す
SKIPPED。

#### 片方だけが既存
該当する重複コードでSKIPPED。

#### reception_idとline_message_idが別々の既存intakeを指す
ERROR。

```text
IDENTIFIER_CONFLICT
```

### 14.4 業務項目不足
以下はERRORにしない。

- project_name空欄
- 単価空欄
- 開始月空欄
- 必須スキル空配列
- 勤務地空欄

警告付きでproject_intakesへ登録する。

### 14.5 値検証
- 単価は整数、0以上
- 単価下限 <= 上限
- work_days_per_weekは1～7
- recruitment_countは1以上
- interview_countは0以上
- start_month <= end_month
- remote_styleは定義値
- foreigner_allowedは定義値
- raw_textは1～50,000文字

---

## 15. 正常行トランザクション

1行ごとにPrismaトランザクションを実行する。

```text
BEGIN
  project_intakes INSERT
  project_sources INSERT
  csv_import_rows INSERT SUCCESS
COMMIT
```

### 15.1 ai_snapshot
正規化後のAI構造化項目からJSONを作成する。

含める項目:

- project_name～employment_condition
- warning_codes
- prompt_version

含めない項目:

- raw_text
- line_user_id
- line_group_id
- source_company
- source_contact
- reception_id
- line_message_id

### 15.2 通常カラム
ai_snapshotと同じ初期値を`project_intakes`の編集可能カラムへ保存する。

### 15.3 project_sources
以下を保存する。

- project_intake_id
- project_id=NULL
- reception_id
- line_message_id
- line_user_id
- line_group_id
- source_company
- source_contact
- raw_text
- received_at

### 15.4 競合
一意制約違反が発生した場合はトランザクションをROLLBACKする。

Prismaの一意制約エラーを解析し、csv_import_rowsを別トランザクションでSKIPPEDまたはERRORとして保存する。

---

## 16. 行エラー記録

行処理失敗時も`csv_import_rows`を保存する。

```text
status = ERROR
raw_data = パース済みの元行
error_code = 対応コード
error_message = 管理者向け説明
project_intake_id = NULL
```

### 16.1 行エラーコード

| コード | 内容 |
|---|---|
| REQUIRED_RECEPTION_ID | reception_idなし |
| REQUIRED_LINE_MESSAGE_ID | line_message_idなし |
| REQUIRED_RECEIVED_AT | received_atなし |
| REQUIRED_RAW_TEXT | raw_textなし |
| REQUIRED_PROMPT_VERSION | prompt_versionなし |
| INVALID_JSON_ARRAY | JSON配列不正 |
| INVALID_INTEGER | 整数不正 |
| INVALID_MONTH | YYYY-MM不正 |
| INVALID_DATETIME | 日時不正 |
| INVALID_REMOTE_STYLE | remote_style不正 |
| INVALID_FOREIGNER_ALLOWED | foreigner_allowed不正 |
| RAW_TEXT_TOO_LONG | 原文上限超過 |
| DUPLICATE_ID_IN_FILE | 同一CSV内重複 |
| DUPLICATE_RECEPTION_ID | DB受付ID重複 |
| DUPLICATE_LINE_MESSAGE_ID | DB LINE ID重複 |
| IDENTIFIER_CONFLICT | 2つのIDが別案件を指す |
| VALIDATION_ERROR | その他の値不正 |

---

## 17. ファイル結果判定

| success | failed | skipped | ファイルstatus | 移動先 |
|---:|---:|---:|---|---|
| 1以上 | 0 | 任意 | SUCCESS | processed |
| 1以上 | 1以上 | 任意 | PARTIAL_SUCCESS | processed |
| 0 | 0 | 1以上 | SKIPPED | processed |
| 0 | 1以上 | 任意 | ERROR | error |
| ファイル検証失敗 | - | - | ERROR | error |

`imported_at`は最終判定時に設定する。

---

## 18. Driveファイル移動

### 18.1 移動方法
同一ファイルの親フォルダを更新する。

成功・部分成功・スキップ:

```text
addParents = PROCESSED_FOLDER_ID
removeParents = INBOX_FOLDER_ID
```

エラー:

```text
addParents = ERROR_FOLDER_ID
removeParents = INBOX_FOLDER_ID
```

### 18.2 成功

```text
drive_move_status = MOVED
```

### 18.3 失敗

```text
drive_move_status = MOVE_PENDING
attempt_count += 1
error_code = DRIVE_MOVE_FAILED
```

DB登録は再実行しない。

### 18.4 再試行上限
5回。

5回失敗後:

```text
drive_move_status = ERROR
```

管理画面のCSV取込履歴へ表示する。

---

## 19. ファイルエラーコード

| コード | 内容 |
|---|---|
| INVALID_FILE_NAME | ファイル名不正 |
| UNSUPPORTED_SCHEMA_VERSION | 未対応schema |
| EMPTY_FILE | データ行0件 |
| FILE_TOO_LARGE | 10MiB超過 |
| INVALID_UTF8_BOM | BOMなし |
| HEADER_MISMATCH | ヘッダー不一致 |
| DUPLICATE_HEADER | ヘッダー重複 |
| ROW_LIMIT_EXCEEDED | 1,000行超過 |
| CSV_PARSE_ERROR | CSV構文不正 |
| MIXED_PROMPT_VERSION | prompt版混在 |
| DRIVE_DOWNLOAD_FAILED | ダウンロード失敗 |
| DRIVE_MOVE_FAILED | フォルダ移動失敗 |

---

## 20. 内部API

### 20.1 Request

```http
POST /api/internal/google-drive-import
Authorization: Bearer <CRON_SECRET>
Content-Type: application/json
```

Bodyなし。

### 20.2 Success Response

```json
{
  "checkedAt": "2026-08-05T15:30:00+09:00",
  "listedFiles": 3,
  "processedFiles": 3,
  "successFiles": 1,
  "partialSuccessFiles": 1,
  "errorFiles": 0,
  "skippedFiles": 1,
  "movePendingFiles": 0
}
```

### 20.3 HTTP Status

| HTTP | 条件 |
|---:|---|
| 200 | Cron実行完了。個別ファイルERRORを含んでも200 |
| 401 | CRON_SECRET不正 |
| 500 | Drive一覧取得不能、DB接続不能等で処理全体が開始できない |

個別ファイルの失敗は`csv_imports`へ記録し、API全体は200を返す。

---

## 21. 簡易連携状態

専用監視テーブルは作成しない。

確認待ち案件一覧を開いたときに以下を取得する。

### 21.1 Drive接続
Drive APIでinboxを一覧取得する。

表示:

```text
Drive接続：正常
inbox：2ファイル
確認日時：2026-08-05 15:31
```

### 21.2 最終取込
`csv_imports.imported_at`の最大値を表示する。

### 21.3 エラー
以下を件数表示する。

- status=ERROR
- status=PARTIAL_SUCCESS
- drive_move_status=MOVE_PENDING
- drive_move_status=ERROR

---

## 22. ログ

### 22.1 必須項目
- event
- drive_file_id
- file_name
- csv_import_id
- batch_id
- row_number
- reception_id
- status
- error_code
- elapsed_ms

### 22.2 ログ禁止
- GOOGLE_PRIVATE_KEY
- CRON_SECRET
- LINE原文全文
- CSVファイル全文
- raw_data全文

エラーログへ原文を含めない。

---

## 23. テスト

### 23.1 GAS
- 同時実行で1バッチだけ作成
- 異なるprompt_versionを別CSVへ分割
- 1,001行を2CSVへ分割
- 9MiB前後でファイル分割
- raw_text内の改行・カンマ・引用符
- CSV作成後のシート更新失敗から復旧
- 同一batch_idを再作成しない

### 23.2 ファイル
- 正常CSV
- BOMなし
- 空CSV
- ヘッダー順不正
- ヘッダー重複
- 不明列
- 1,001行
- 10MiB超過
- 不完全な引用符
- セル内改行
- Unicode偽ヘッダー
- prompt_version混在

### 23.3 行
- 必須IDなし
- 日時不正
- JSON配列不正
- 小数単価
- 単価下限 > 上限
- work_days_per_week=8
- raw_text=50,001文字
- 同一CSV内ID重複
- DB既存ID
- 2つのIDが別intakeを指す
- 案件名・単価・開始月なしでもPENDING登録

### 23.4 障害
- Cron二重実行
- Driveダウンロード失敗
- DB行登録失敗
- 99行成功・1行失敗
- DB登録後のDrive移動失敗
- MOVE_PENDING再試行
- PROCESSINGが2時間残留
- 同一内容を別Driveファイルとして配置

---

## 24. 実装モジュール案

```text
src/
├─ app/api/internal/google-drive-import/route.ts
├─ lib/google/drive-client.ts
├─ lib/csv/csv-contract.ts
├─ lib/csv/csv-parser.ts
├─ lib/csv/csv-normalizer.ts
├─ lib/import/import-file.ts
├─ lib/import/import-row.ts
├─ lib/import/import-reconcile.ts
├─ lib/import/import-errors.ts
└─ lib/crypto/sha256.ts
```

### 24.1 責務

| モジュール | 責務 |
|---|---|
| drive-client | list、download、move |
| csv-contract | ヘッダー、定義値、上限 |
| csv-parser | BOM、CSV構文、ヘッダー |
| csv-normalizer | 型変換、NULL変換 |
| import-file | ファイル全体制御 |
| import-row | 1行トランザクション |
| import-reconcile | MOVE_PENDING、PROCESSING残留 |
| import-errors | エラーコード |
| sha256 | ファイルハッシュ |

---

## 25. 公式ドキュメント参照

- Google Drive API `files.list`  
  https://developers.google.com/workspace/drive/api/reference/rest/v3/files/list
- Google Drive API `files.get`  
  https://developers.google.com/workspace/drive/api/reference/rest/v3/files/get
- Google Drive API `files.update`  
  https://developers.google.com/workspace/drive/api/reference/rest/v3/files/update
- Google Drive API 認証スコープ  
  https://developers.google.com/workspace/drive/api/guides/api-specific-auth
- Apps Script LockService  
  https://developers.google.com/apps-script/reference/lock/lock-service

---

## 26. 詳細設計完了条件

- CSV33列と順序が確定している
- 各列の型・NULL・上限が確定している
- GASの分割・排他・冪等処理が確定している
- Drive一覧取得・ダウンロード・移動が確定している
- ファイル検証順序が確定している
- 行検証とDB登録トランザクションが確定している
- SUCCESS、PARTIAL_SUCCESS、ERROR、SKIPPEDの条件が確定している
- Drive移動失敗とPROCESSING残留の復旧方法が確定している
- DB詳細設計v1.1の修正が反映されている
