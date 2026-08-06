# Phase 4 実装指示書 — CSV・Google Drive自動取込

作成日時: 2026-08-06 17:05 +09:00
対象リポジトリ: `abikohiroken/ses-project-manager`
作業ブランチ: `feature/phase4-drive-import`（最新 `main` から作成すること）

---

## 0. 実装AIへの前提

### 0.1 あなたの役割

`docs/` の設計一式に従い、**Phase 4（CSV・Google Drive自動取込）のみ**を実装する。

設計は確定している。**設計を作り直さない。設計に書かれていない仕様を発明しない。**

### 0.2 文書の優先順位

```text
1. docs/09_実装指示/設計差分_v1.2_実装前確定事項.md
2. 本書（Phase4_実装指示書.md）
3. docs/03_CSV-Drive取込/CSV-GoogleDrive取込詳細設計書_v1.0.md
4. docs/07_Drive-Dokploy/GoogleDrive-Dokploy詳細設計書_v1.0.md
5. docs/04_API/API詳細設計書_v1.0.md
6. docs/01_基本設計/基本設計_v2.5差分_LINE受信経路修正.md
7. docs/01_基本設計/SES案件管理WEBアプリ_基本設計書_v2.4_確定版.md
```

**Phase 4 は設計差分v1.2 の §1・§2・§4 が直接効く唯一のフェーズである。** 着手前に必ずこの3節を読むこと。基本設計 v2.4 §11.3 は v1.2 §2 で破棄されている。

### 0.3 判断に迷ったら

設計書に答えがない事項を見つけたら、**推測して実装せず、作業を止めて質問する。**

### 0.4 作業ディレクトリの共有

このリポジトリの作業ディレクトリは設計担当と共有している。**ブランチを切り替えたら必ず報告すること。**

---

## 1. スコープ

### 1.1 実装する

| 区分 | 内容 |
|---|---|
| Drive Client | `files.list` / `files.get`（ダウンロード）/ `files.update`（移動） |
| CSV | 契約定義・パーサー・正規化 |
| 取込 | ファイル制御・行トランザクション・整合性修復・エラーコード |
| 内部API | `/api/internal/google-drive-import` / `drive-move-retry` / `import-reconcile` |
| Cronスクリプト | `scripts/drive-import-cron.mjs` |
| 差し替え | `src/lib/google/drive-status.ts` をスタブから実運用実装へ |

### 1.2 実装しない

- LINE Webhook・Google Sheets連携（Phase 5）
- GAS・ChatGPTプロンプト（Phase 6）
- 新規の画面（Phase 3で完了。CSV取込履歴画面は既にある）
- **新規の業務API**（Phase 2 の19エンドポイントを変更しない）

`integration-status` の Drive 部分がスタブから実装に変わることで、画面の表示が「エラー」から「正常」へ変わる。これは想定内の変化である。

---

## 2. 依存パッケージ【今回に限り追加を承認】

これまでのフェーズでは依存追加を禁止していたが、Phase 4 は外部連携のため以下**3つだけ**追加を承認する。

| パッケージ | 版 | 用途 |
|---|---|---|
| `@googleapis/drive` | 21.0.0 | Drive API v3 クライアント |
| `google-auth-library` | 11.0.0 | サービスアカウントのJWT認証 |
| `csv-parse` | 7.0.2 | RFC 4180 準拠パーサー |

**これ以外を追加しない。** 必要と判断したら実装を止めて報告すること。

### 2.1 `googleapis`（全部入り）を使わない

`googleapis` は unpacked で **206MB** ある（実測）。本システムが使うのは `files.list` / `files.get` / `files.update` の3つだけであり、Dockerイメージに206MBを持ち込む理由がない。

スコープ版 `@googleapis/drive` は **2.4MB** で、必要な3メソッドがすべて揃っていることを実測確認済みである。

Phase 5 で Sheets が必要になった際も、同じ理由で `@googleapis/sheets` を使うこと。

### 2.2 クライアントの構築（実測確認済み）

```ts
import { drive } from "@googleapis/drive";
import { JWT } from "google-auth-library";

const auth = new JWT({
  email: env.GOOGLE_CLIENT_EMAIL,
  key: env.GOOGLE_PRIVATE_KEY,          // §2.3 の改行復元後
  scopes: ["https://www.googleapis.com/auth/drive"],
});
const client = drive({ version: "v3", auth });
```

### 2.3 秘密鍵の改行復元

`GOOGLE_PRIVATE_KEY` は環境変数として1行で格納されるため、`\n` を実改行へ復元してから `JWT` へ渡す（Drive-Dokploy詳細設計 §7.3）。

**復元処理を純粋関数として切り出し、テストすること。** ここを間違えると認証が通らず、原因究明に時間を取られる。

秘密鍵をログへ出力しない。

---

## 3. csv-parse の実測結果と注意点

以下は `csv-parse@7.0.2` で実測した結果である。

| 入力 | 結果 |
|---|---|
| BOM付き + CRLF | 正常。`bom: true` でBOMは除去され、先頭ヘッダーに残らない |
| セル内カンマ | 正常 |
| セル内改行 | 正常 |
| `""` エスケープ | 正常 |
| 不完全な引用符 | エラー `CSV_INVALID_CLOSING_QUOTE` |
| 列数不一致 | エラー `CSV_RECORD_INCONSISTENT_FIELDS_LENGTH`（`relax_column_count: false` 時） |
| 空セル | 正常 |
| **NUL文字** | **エラーにならず素通しする** |

### 3.1 NUL文字は自前で検証する【重要】

基本設計 §17.5 と 取込詳細設計 §6.2 は NUL文字の拒否を要求しているが、**`csv-parse` は NUL を通す**。

パーサー任せにせず、**ダウンロードしたバイト列またはパース結果に対して自前で NUL を検出し、拒否すること。**

判定位置は実装者が決めてよいが、行単位で検出して当該行だけをエラーにするか、ファイル全体を `CSV_PARSE_ERROR` にするかを報告時に明記すること。

### 3.2 パーサーのオプション

```ts
parse(input, {
  bom: true,
  relax_column_count: false,   // 列数不一致を検出させる
  // columns: false（配列で受け、ヘッダー検証は自前で行う）
})
```

ヘッダー検証（33列・順序完全一致・NFC正規化・重複拒否・不明列拒否）は `columns` オプションに任せず**自前で実装する**。設計が要求する検証はライブラリの機能より厳しい。

### 3.3 csv-parse のエラーコード対応

| csv-parse | 本システム |
|---|---|
| `CSV_INVALID_CLOSING_QUOTE` | `CSV_PARSE_ERROR` |
| `CSV_RECORD_INCONSISTENT_FIELDS_LENGTH` | `CSV_PARSE_ERROR` |
| その他のパースエラー | `CSV_PARSE_ERROR` |

例外メッセージ原文をAPIレスポンスやログへそのまま出さない。

---

## 4. モジュール構成

取込詳細設計 §24 の構成に従う。

```text
src/
├─ app/api/internal/
│  ├─ google-drive-import/route.ts
│  ├─ drive-move-retry/route.ts
│  └─ import-reconcile/route.ts
├─ lib/
│  ├─ google/
│  │  ├─ drive-client.ts        list / download / move
│  │  └─ drive-status.ts        スタブを実装へ差し替え
│  ├─ csv/
│  │  ├─ csv-contract.ts        ヘッダー・定義値・上限
│  │  ├─ csv-parser.ts          BOM・CSV構文・ヘッダー
│  │  └─ csv-normalizer.ts      型変換・NULL変換
│  ├─ import/
│  │  ├─ import-file.ts         ファイル全体制御
│  │  ├─ import-row.ts          1行トランザクション
│  │  ├─ import-reconcile.ts    MOVE_PENDING・PROCESSING残留
│  │  └─ import-errors.ts       エラーコード
│  └─ crypto/sha256.ts
└─ scripts/drive-import-cron.mjs
```

### 4.1 csv-contract.ts

`docs/03_CSV-Drive取込/csv-drive-import-contract.ts` を `src/lib/csv/csv-contract.ts` へコピーする。

**内容を変更しない。** 33列のヘッダー順・ファイル名正規表現・定義値・上限値はこのファイルが正本である。

### 4.2 Route Handler の runtime

内部APIは Node.js の crypto とバイト処理を使うため、Node ランタイムで動かす。Next.js 16 の Route Handler は既定で Node だが、明示すること。

```ts
export const runtime = "nodejs";
```

---

## 5. 処理仕様

### 5.1 全体の処理順序（取込詳細設計 §11）

1回の実行で以下を**この順に**行う。

```text
1. MOVE_PENDING の再試行（古い順・最大10件）
2. PROCESSING残留の修復（processing_started_at < 現在 - 2時間）
3. inbox の新規ファイル処理
```

1回の上限は **最大10ファイル または 最大5分**。先に到達した時点で終了し、残りは次回に回す。

### 5.2 1ファイルの処理順序【設計差分v1.2 §2 が効く】

**基本設計 v2.4 §11.3 の「先に drive_file_id を INSERT して処理権を確保する」方式は破棄されている。** 以下が正しい順序である。

```text
1. ファイル名検証（正規表現）
2. サイズ検証（Driveメタデータ）
3. ダウンロード
4. SHA-256算出
5. 同一内容確認
6. csv_imports INSERT（status=PROCESSING、file_hash設定済み）
7. ヘッダー・行検証
8. 行登録
9. 結果判定・Drive移動
```

理由: `csv_imports_downloaded_state_ck` 制約が `status <> 'ERROR'` のとき `file_hash` / `schema_version` / `batch_id` を NOT NULL で要求するため、ダウンロード前に PROCESSING で INSERT できない。

#### 5.2.1 同時実行の扱い

手順6の INSERT で `drive_file_id` の一意制約違反（Prisma **P2002**）が発生した場合:

- **「他プロセスが処理中」として当該ファイルをスキップし、次のファイルへ進む**
- エラーとして `csv_imports` に記録しない
- ログのみ（`event=file_already_claimed`）

二重登録防止の最終的な担保は `csv_imports.drive_file_id` の一意制約である。

#### 5.2.2 ダウンロード前にERROR確定する場合

`file_hash = NULL` のまま `status = ERROR` で INSERT する。これは `downloaded_state_ck` の `status = 'ERROR'` 分岐を満たす。

対象: `INVALID_FILE_NAME` / `FILE_TOO_LARGE` / `DRIVE_DOWNLOAD_FAILED`

### 5.3 ファイル検証の順序（取込詳細設計 §13）

順序を固定する。

```text
1. ファイル名  2. サイズ  3. ダウンロード  4. UTF-8 BOM
5. CSV構文    6. ヘッダー 7. 行数        8. prompt_version統一
9. 行バリデーション
```

- BOM: 先頭3バイトが `EF BB BF` であること。無ければ `INVALID_UTF8_BOM`
- ヘッダー: 33列・**順序を含めて完全一致**・Unicode **NFC正規化後**に比較・重複拒否・不明列拒否
- 行数: 0件 → `EMPTY_FILE` / 1,001件以上 → `ROW_LIMIT_EXCEEDED`
- `prompt_version` が全行で同一でなければ `MIXED_PROMPT_VERSION`

### 5.4 SKIPPED の2種類【設計差分v1.2 §1 が効く】

`csv_imports.error_code` は**終了理由コード**として使う。SKIPPED には性質の異なる2種類がある。

| 種別 | 発生条件 | `duplicate_of_import_id` | `error_code` |
|---|---|---|---|
| ファイル重複 | 同一 `file_hash` の取込済みファイルが存在 | 元の `csv_imports.id` | `FILE_DUPLICATE` |
| 全行スキップ | 全データ行がDB既存案件 | **NULL** | `ALL_ROWS_SKIPPED` |

DB制約は v1.2 §1.2 で「`duplicate_of_import_id` を持てるのは SKIPPED だけ（SKIPPEDが必ず持つとは限らない）」に緩和済みである。**全行スキップ時に `duplicate_of_import_id` を埋めようとしないこと。**

同一 `file_hash` の検索対象は `status IN (SUCCESS, PARTIAL_SUCCESS, SKIPPED)` のみ。ERROR の同一ハッシュしかない場合は再処理を許可する。

### 5.5 行の処理（取込詳細設計 §14〜§16）

1行ごとに Prisma トランザクションを実行する。

```text
BEGIN
  project_intakes INSERT
  project_sources INSERT
  csv_import_rows INSERT (SUCCESS)
COMMIT
```

#### 5.5.1 ai_snapshot に含める / 含めない

**含める**: `project_name` 〜 `employment_condition` / `warning_codes` / `prompt_version`

**含めない**: `raw_text` / `line_user_id` / `line_group_id` / `source_company` / `source_contact` / `reception_id` / `line_message_id`

`ai_snapshot` と同じ初期値を `project_intakes` の編集可能カラムへも保存する。

#### 5.5.2 業務項目不足はエラーにしない

以下は**警告付きで確認待ちへ登録する**。行エラーにしない。

```text
project_name空欄 / 単価空欄 / 開始月空欄 / 必須スキル空配列 / 勤務地空欄
```

#### 5.5.3 DB既存確認

| 状況 | 結果 |
|---|---|
| `reception_id` と `line_message_id` が同じ既存 intake を指す | SKIPPED |
| 片方だけが既存 | 該当する重複コードで SKIPPED |
| 2つのIDが**別々の**既存 intake を指す | ERROR `IDENTIFIER_CONFLICT` |

#### 5.5.4 行の失敗時

一意制約違反が起きたらトランザクションを ROLLBACK し、**別トランザクションで** `csv_import_rows` を SKIPPED または ERROR として保存する。行が1件失敗してもファイル全体を止めない。

### 5.6 ファイル結果判定（取込詳細設計 §17）

| success | failed | skipped | status | 移動先 |
|---:|---:|---:|---|---|
| 1以上 | 0 | 任意 | SUCCESS | processed |
| 1以上 | 1以上 | 任意 | PARTIAL_SUCCESS | processed |
| 0 | 0 | 1以上 | SKIPPED | processed |
| 0 | 1以上 | 任意 | ERROR | error |
| ファイル検証失敗 | - | - | ERROR | error |

`imported_at` は最終判定時に設定する。

### 5.7 export_batches の連携【設計差分v1.2 §4 が効く】

`csv_imports.export_batch_id` は `@unique` である。

- `export_batches` へのupsertと `export_batch_id` の設定は **status ∈ {SUCCESS, PARTIAL_SUCCESS} のときだけ**行う
- SKIPPED / ERROR は `export_batch_id = NULL`
- upsert対象の `export_batches` が既に別の `csv_imports` とリンク済みの場合は、リンクせず `export_batch_id = NULL` とし、`error_code = BATCH_ALREADY_IMPORTED` を記録する（処理は継続し、行登録結果は維持する）

upsert のタイミングは **行登録完了後・結果判定時**である（取込詳細設計 §13.6 の「ファイル検証後」から変更）。

`export_batches_generated_state_ck` 制約があるため、`status=CREATED` にするときは `generated_at` と `drive_file_id` を必ず同時に設定する。

### 5.8 Drive移動と MOVE_PENDING（取込詳細設計 §18）

移動は親フォルダの付け替えで行う。

```text
成功系: addParents=PROCESSED_FOLDER_ID, removeParents=INBOX_FOLDER_ID
エラー: addParents=ERROR_FOLDER_ID,    removeParents=INBOX_FOLDER_ID
```

**DB登録成功後にDrive移動だけ失敗した場合、DB登録を再実行しない。**

```text
drive_move_status = MOVE_PENDING
attempt_count += 1
error_code = DRIVE_MOVE_FAILED
```

再試行上限5回。5回失敗で `drive_move_status = ERROR`。

### 5.9 PROCESSING残留の修復（取込詳細設計 §11.2）

`status = PROCESSING` かつ `processing_started_at < 現在 - 2時間` を検出する。

| 状況 | 対応 |
|---|---|
| 行登録が完了済み | ファイル移動処理へ進む |
| 行登録が未完了 | `attempt_count += 1` して再処理 |
| 5回失敗 | `status = ERROR` |

### 5.10 Google API のリトライ（Drive-Dokploy詳細設計 §2.7）

429 / 500 / 502 / 503 / 504 は**指数バックオフで最大3回**再試行する。

```text
1秒 → 2秒 → 4秒（ランダムジッターを加える）
```

**認証エラー・権限エラーは自動再試行しない。**

---

## 6. 内部API

### 6.1 認証

```http
Authorization: Bearer <CRON_SECRET>
```

不一致は 401 `INVALID_CRON_SECRET`（Phase 1 で定義済み）。

**比較はタイミング攻撃に配慮した方法で行う**（`crypto.timingSafeEqual` 等）。単純な `===` を使わない。

### 6.2 エンドポイント

| メソッド | パス | 内容 |
|---|---|---|
| POST | `/api/internal/google-drive-import` | 取込を1回実行 |
| POST | `/api/internal/drive-move-retry` | MOVE_PENDING を最大10件再試行 |
| POST | `/api/internal/import-reconcile` | 2時間以上残留する PROCESSING を修復 |

### 6.3 レスポンス

`google-drive-import` の成功レスポンスは取込詳細設計 §20.2 の形式（`ImportRunResult`）。

| HTTP | 条件 |
|---|---:|
| 200 | Cron実行完了。**個別ファイルERRORを含んでも200** |
| 401 | CRON_SECRET不正 |
| 500 | Drive一覧取得不能・DB接続不能等で処理全体が開始できない |

個別ファイルの失敗は `csv_imports` へ記録し、API全体は200を返す。

Route Handler に業務処理を直接書かない。共通サービス関数を呼ぶ。

### 6.4 Cronスクリプト

```text
scripts/drive-import-cron.mjs
```

`APP_URL` と `CRON_SECRET` を使って `/api/internal/google-drive-import` を呼ぶ。

- 非0終了コードで失敗を通知する（Dokploy の Job ログで検知できるようにする）
- レスポンス本文の要約をログへ出す
- **秘密値をログへ出さない**

Dokploy Schedule Job の設定（Drive-Dokploy詳細設計 §6.1）:

```text
Name: drive-import
Cron: */30 * * * *
Timezone: Asia/Tokyo
Command: node scripts/drive-import-cron.mjs
```

`drive-move-retry` / `import-reconcile` の個別Jobは初期状態で**無効**とする（通常は取込Job内で実行されるため）。障害対応用に残す。

---

## 7. drive-status.ts の差し替え

Phase 2 でスタブとして作った `src/lib/google/drive-status.ts` を実装に差し替える。

- Drive API で inbox を一覧取得し、`connected: true` / `inboxFiles: <件数>` / `checkedAt` を返す
- **Drive API が失敗しても例外を投げない。** `connected: false` と `errorCode: "GOOGLE_DRIVE_UNAVAILABLE"` を返す
- `GET /api/integration-status` は Drive が落ちていても **200** を返す（API詳細設計 §9.1）

インターフェース（`DriveStatus` 型）は Phase 2 のまま変更しない。画面側の修正を不要にすること。

---

## 8. ログ（取込詳細設計 §22）

**出力する**: `event` / `drive_file_id` / `file_name` / `csv_import_id` / `batch_id` / `row_number` / `reception_id` / `status` / `error_code` / `elapsed_ms`

**出力禁止**: `GOOGLE_PRIVATE_KEY` / `CRON_SECRET` / LINE原文全文 / CSVファイル全文 / `raw_data` 全文

エラーログへ原文を含めない。

---

## 9. テスト要件

Vitest。Drive API と Prisma は `vi.mock` してよい。実際のGoogle APIを叩くテストは書かない。

**セクション単位の消化状況を §11 の報告に必ず書くこと。**

### A. CSVパーサー

1. BOM付き正常CSV（33列）がパースできる
2. BOMなし → `INVALID_UTF8_BOM`
3. 不完全な引用符 → `CSV_PARSE_ERROR`
4. 列数不一致 → `CSV_PARSE_ERROR`
5. セル内改行・セル内カンマ・`""` エスケープが保持される
6. **NUL文字を含む入力が拒否される**（§3.1。csv-parseは素通しするので自前検証）
7. ヘッダー順序違い → `HEADER_MISMATCH`
8. ヘッダー重複 → `DUPLICATE_HEADER`
9. 不明列 → `HEADER_MISMATCH`
10. Unicode偽ヘッダー（キリル文字混入）がNFC正規化後に拒否される
11. 0行 → `EMPTY_FILE` / 1,001行 → `ROW_LIMIT_EXCEEDED`
12. `prompt_version` 混在 → `MIXED_PROMPT_VERSION`

### B. 正規化・行バリデーション

13. 空文字がNULLへ変換される（任意項目）
14. 空文字を許可しない項目（`reception_id` 等8項目）が行エラーになる
15. JSON配列の検証（非配列 / 非文字列要素 / 空要素除去 / 前後空白除去 / 重複除去 / 順序維持）
16. 小数単価 → `INVALID_INTEGER`
17. 単価下限 > 上限 → `VALIDATION_ERROR`
18. `work_days_per_week=8` → `VALIDATION_ERROR`
19. `raw_text` 50,001文字 → `RAW_TEXT_TOO_LONG`
20. `remote_style` / `foreigner_allowed` の定義外値 → 対応するエラーコード
21. `start_month` が `YYYY-MM` → DBは `YYYY-MM-01`（**UTC構築でずれない**）
22. `received_at` のタイムゾーンなし → `INVALID_DATETIME`
23. 業務項目不足（案件名・単価・開始月・必須スキル・勤務地）が**エラーにならず**PENDING登録される

### C. ファイル結果判定と SKIPPED 2種【v1.2 §1】

24. success≥1 / failed=0 → SUCCESS・processed
25. success≥1 / failed≥1 → PARTIAL_SUCCESS・processed
26. success=0 / failed=0 / skipped≥1 → SKIPPED・processed
27. success=0 / failed≥1 → ERROR・error
28. ファイル重複 → SKIPPED・`duplicate_of_import_id` 設定・`error_code=FILE_DUPLICATE`
29. **全行スキップ → SKIPPED・`duplicate_of_import_id` は NULL・`error_code=ALL_ROWS_SKIPPED`**
30. 項目29でDB制約違反が起きないこと

### D. 重複・競合【v1.2 §2】

31. `drive_file_id` 既存 → 状態に応じた分岐（MOVE_PENDING / PROCESSING 2時間未満 / 終了かつMOVED / PROCESSING 2時間以上）
32. INSERT時の **P2002 が「他プロセスが処理中」としてスキップされ、エラー記録されない**
33. 同一 `file_hash` が ERROR しか無い場合は再処理される
34. 同一CSV内のID重複 → 2件目以降 `DUPLICATE_ID_IN_FILE`
35. 2つのIDが別々の既存 intake を指す → `IDENTIFIER_CONFLICT`

### E. Drive移動と MOVE_PENDING

36. 成功系は processed へ、ERROR は error へ移動する
37. DB登録成功後の移動失敗 → `MOVE_PENDING` かつ **DB登録を再実行しない**
38. 再試行成功で `MOVED`
39. 5回失敗で `drive_move_status = ERROR`

### F. PROCESSING残留の修復

40. 2時間未満は対象外
41. 2時間以上・行登録完了済み → 移動処理へ進む
42. 2時間以上・行登録未完了 → `attempt_count += 1` して再処理
43. 5回失敗で `status = ERROR`

### G. 内部API・上限・リトライ

44. `CRON_SECRET` 不正 → 401 `INVALID_CRON_SECRET`
45. 秘密値の比較がタイミング攻撃に配慮した方法である
46. 個別ファイルERRORを含んでも API全体は 200
47. 最大10ファイルで打ち切られる
48. Google API の 429/5xx が指数バックオフで最大3回再試行される
49. 認証・権限エラーは再試行されない

### H. export_batches 連携【v1.2 §4】

50. SUCCESS / PARTIAL_SUCCESS のときだけ upsert とリンクが行われる
51. SKIPPED / ERROR は `export_batch_id = NULL`
52. 既にリンク済みの batch なら `error_code = BATCH_ALREADY_IMPORTED` でリンクせず継続

### I. 秘密鍵の改行復元（§2.3）

53. `\n` を含む1行の秘密鍵が実改行へ復元される
54. 既に実改行の場合も壊さない

---

## 10. 禁止事項

1. `googleapis`（全部入り）を使う
2. §2 の3パッケージ以外の依存を追加する
3. `split(",")` 等の独自CSV分割を実装する
4. NUL文字の検証をパーサー任せにする
5. ダウンロード前に `status=PROCESSING` で `csv_imports` を INSERT する（v1.2 §2 違反）
6. 全行スキップ時に `duplicate_of_import_id` を埋める（v1.2 §1 違反・制約違反になる）
7. SKIPPED / ERROR に `export_batch_id` をリンクする（v1.2 §4 違反）
8. DB登録成功後のDrive移動失敗でDB登録を再実行する
9. `CRON_SECRET` の比較に `===` を使う
10. 個別ファイルのERRORで内部API全体を500にする
11. Route Handler に業務処理を直接書く
12. `prisma/schema.prisma` を変更する
13. Phase 2 の業務API（19エンドポイント）を変更する
14. `drive-status.ts` の `DriveStatus` 型を変更する（画面側に影響するため）
15. 秘密鍵・`CRON_SECRET`・LINE原文・CSV全文をログへ出力する
16. 実際のGoogle APIを叩くテストを書く
17. `any` で型エラーを回避する
18. 設計書にない仕様を推測で実装する

---

## 11. 完了条件

| # | 確認 | 期待 |
|---:|---|---|
| 1 | `npm run lint` | エラー0 |
| 2 | `npm run typecheck` | エラー0 |
| 3 | `npm run build` | 成功 |
| 4 | `npm run test` | 全件成功。§9 A〜I を網羅 |
| 5 | `docker build .` | 成功 |
| 6 | イメージサイズ | Phase 3 から**大幅に増えていない**（`googleapis` 不使用の確認） |
| 7 | サンプルCSVの取込 | `docs/03_CSV-Drive取込/ses_projects_v1_SAMPLE.csv` をローカルDBへ取込成功 |
| 8 | 部分成功 | 1行だけ不正なCSVで PARTIAL_SUCCESS になり、正常行が登録される |
| 9 | 内部API 401 | 不正な `CRON_SECRET` で 401 |
| 10 | `GET /api/integration-status` | Drive未設定時も 200・`connected=false` |
| 11 | Cronスクリプト | `node scripts/drive-import-cron.mjs` が動作し、失敗時に非0終了 |
| 12 | `prisma/schema.prisma` | 差分なし |
| 13 | テーブル数 | 7のまま |
| 14 | `git grep` で秘密値 | 検出0件 |

### 11.1 実Google Driveでの疎通

Driveフォルダと認証情報が未整備のため、**実Driveでの疎通確認は完了条件に含めない。**

Drive Client はモックでテストし、実疎通は環境整備後に別途行う。

環境整備で必要になる値（設計担当が別途手配する）:

```text
GOOGLE_PROJECT_ID / GOOGLE_CLIENT_EMAIL / GOOGLE_PRIVATE_KEY
GOOGLE_DRIVE_INBOX_FOLDER_ID / _PROCESSED_ / _ERROR_
```

**これらが無くてもアプリが起動し、Drive以外の機能が動くこと**を確認すること（`src/lib/env.ts` でこれらは任意扱いのまま）。

---

## 12. 報告フォーマット

```text
## 実装したファイル
（パス一覧）

## §9 テスト要件の消化状況
A CSVパーサー              : 実装 / 一部（内訳） / 未実装
B 正規化・行バリデーション : 〃
C ファイル結果判定・SKIPPED2種 : 〃
D 重複・競合               : 〃
E Drive移動・MOVE_PENDING  : 〃
F PROCESSING残留の修復     : 〃
G 内部API・上限・リトライ  : 〃
H export_batches連携       : 〃
I 秘密鍵の改行復元         : 〃

一部・未実装がある場合は、項目番号と理由を明記すること。

## NUL文字の検証位置
（行単位でエラーにしたか、ファイル全体をエラーにしたか。§3.1）

## §11 完了条件の実行結果
（#1〜#14 それぞれの実結果。失敗したものは失敗と書く）

## 設計と異なる判断をした箇所
（なければ「なし」）

## 未実装・積み残し

## 判断を仰ぎたい点
```

失敗した項目を「成功」と報告しない。

---

## 13. 作業手順

```text
1. 最新の main から feature/phase4-drive-import を作成（切り替えを報告する）
2. §2 の依存を追加
3. §4 のモジュールを csv-contract → csv-parser → csv-normalizer →
   drive-client → import-row → import-file → import-reconcile の順に実装
4. 内部API → Cronスクリプト → drive-status.ts 差し替え
5. §9 のテストを A〜I すべて実装
6. §11 の完了条件を全項目実行
7. 意味のある単位で複数コミット
8. main 向け Pull Request を作成
```

PR本文に §12 の報告内容を含める。**main へ直接pushしない。**
