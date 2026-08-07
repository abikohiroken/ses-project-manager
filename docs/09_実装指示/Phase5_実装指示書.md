# Phase 5 実装指示書 — LINE Webhook・Google Sheets連携

作成日時: 2026-08-06 19:30 +09:00
対象リポジトリ: `abikohiroken/ses-project-manager`
作業ブランチ: `feature/phase5-line-sheets`（最新 `main` から作成すること）

---

## 0. 実装AIへの前提

### 0.1 あなたの役割

`docs/` の設計一式に従い、**Phase 5（LINE Webhook・Google Sheets連携）のみ**を実装する。

設計は確定している。**設計を作り直さない。設計に書かれていない仕様を発明しない。**

### 0.2 文書の優先順位

```text
1. docs/09_実装指示/設計差分_v1.2_実装前確定事項.md
2. 本書（Phase5_実装指示書.md）
3. docs/01_基本設計/基本設計_v2.5差分_LINE受信経路修正.md
4. docs/06_LINE-Sheets-GAS/LINE-スプレッドシート-GAS詳細設計書_v1.0.md
5. docs/04_API/API詳細設計書_v1.0.md §5
6. docs/01_基本設計/SES案件管理WEBアプリ_基本設計書_v2.4_確定版.md
```

**基本設計 v2.4 §2 の「LINE → Google Apps Script」は v2.5差分で破棄されている。** GASでWebhookを直接受信する構成へ戻さないこと。

### 0.3 判断に迷ったら

設計書に答えがない事項を見つけたら、**推測して実装せず、作業を止めて質問する。**

### 0.4 作業ディレクトリの共有

作業ディレクトリは設計担当と共有している。**ブランチを切り替えたら必ず報告すること。**

### 0.5 外部環境は未整備

LINE公式アカウントもGoogleスプレッドシートも**まだ存在しない**。

Phase 4 の Drive と同じく、**Sheets API と LINE は全てモックで検証する。** 実疎通は環境整備後に別途行う（`docs/10_環境整備/外部環境整備手順書.md`）。

**認証情報やスプレッドシートIDが未設定でもアプリが起動し、Phase 1〜4 の機能が動くこと**を維持する。

---

## 1. スコープ

### 1.1 実装する

| 区分 | 内容 |
|---|---|
| LINE Webhook | `POST /api/webhooks/line` |
| 署名検証 | `x-line-signature` の HMAC-SHA256 検証 |
| イベント振り分け | text message のみ処理、その他は無視して200 |
| Sheets Client | `values.get` / `values.append` |
| 許可判定 | `settings` シートによる送信元判定 |
| raw_inbox 書込 | 13列の追記 |
| 受付ID採番 | `RCP-YYYYMMDD-XXXXXXXX` |

### 1.2 実装しない

- GASスクリプト・ChatGPTプロンプト（Phase 6）
- LINEへのメッセージ送信（初期リリース対象外。基本設計 §4.5）
- `structured_projects` / `export_batches` シートへの書き込み（GASの担当）
- 新規の画面・業務API

---

## 2. 依存パッケージ

### 2.1 追加を承認するもの

| パッケージ | 版 | サイズ | 用途 |
|---|---|---:|---|
| `@googleapis/sheets` | 14.0.0 | 738KB | Sheets API v4 |

**これ1つだけ。** `google-auth-library` は Phase 4 で導入済みのものを再利用する。

### 2.2 LINE SDK は使わない【確定】

`@line/bot-sdk`（3.9MB）を**導入しない。**

理由:

- 本システムがLINEに対して行うのは **Webhookの受信と署名検証だけ**である。メッセージ送信は初期リリース対象外（基本設計 §4.5）
- 署名検証は `node:crypto` の HMAC-SHA256 だけで完結する。実測で確認済み
- SDKが独自にbodyを読むと、「未変更のリクエスト本文」という署名検証の前提が崩れるリスクがある

### 2.3 署名検証の実測結果

日本語・改行・絵文字を含むbodyで、以下がすべて一致することを確認済みである。

```text
createHmac("sha256", secret).update(body, "utf8").digest("base64")
createHmac("sha256", secret).update(bytes).digest("base64")
```

**ただし実装では `request.arrayBuffer()` でバイト列を取得すること。** 「未変更のリクエスト本文」という要件（基本設計 v2.5差分 §1）に対して曖昧さがない。

比較は `crypto.timingSafeEqual` を使う。長さが異なる場合に例外を投げるため、比較前に長さを確認するか、Phase 4 の `cron-auth.ts` と同様にハッシュで固定長化する。

---

## 3. 処理仕様

### 3.1 必須処理順（API詳細設計 §5.1）

**この順序を変えない。**

```text
1. リクエスト本文をバイト列のまま取得（arrayBuffer）
2. 本文を一切変更せず HMAC-SHA256 で署名検証
3. 検証成功後に JSON parse
4. text message イベントだけを処理対象にする
5. settings シートで送信元の許可を確認
6. raw_inbox へ追記
7. 200 を返す
```

**署名検証の前に JSON parse・改行変換・文字列置換・トリムを行わない。**

### 3.2 エラー応答

| 条件 | HTTP | 備考 |
|---|---:|---|
| `x-line-signature` なし / 不一致 | 401 | `INVALID_LINE_SIGNATURE` |
| 本文が1MiB超過 | 413 | `PAYLOAD_TOO_LARGE` |
| JSON不正 | 400 | 署名検証**後**の判定 |
| Sheets API失敗 | 503 | LINEの再送に任せる |
| 成功 | 200 | `{ "received": true }` |

**LINEへのレスポンスに内部エラーの詳細を含めない。** エラーコードやスタックを返さない。

### 3.3 対象イベント（LINE-Sheets-GAS詳細設計 §2.4）

**処理する**

```text
event.type = "message"
event.message.type = "text"
source.type = "user" または "group"
```

**無視して200を返す**

```text
follow / unfollow / join / leave / postback
image / file / audio / video / sticker
source.type = "room"
```

### 3.4 複数イベントの扱い【重要】

LINEは1リクエストの `events` 配列に**複数のイベントを載せてくる**ことがある。

- 配列の**全要素**を走査し、条件を満たすものそれぞれについて raw_inbox へ1行ずつ追記する
- 先頭だけを処理しない
- 途中で Sheets への追記が失敗した場合は **503** を返す。LINEがリクエスト全体を再送するが、既に書き込めた行は `line_message_id` の重複判定でスキップされる（§3.7）

### 3.5 送信元情報（同 §2.5）

| `source.type` | `line_user_id` | `line_group_id` |
|---|---|---|
| `user` | `source.userId` | 空欄 |
| `group` | `source.userId` | `source.groupId` |

`group` の場合でも `source.userId` は存在しないことがある（LINEの仕様上、ユーザーIDが取得できないケース）。その場合は空欄にする。

### 3.6 受付IDの採番（同 §2.6）

```text
RCP-YYYYMMDD-XXXXXXXX
```

- `YYYYMMDD` は **JST** の当日。Phase 4 の `jstDateKey` 相当の考え方を使い、ローカルタイムに依存させない
- 末尾8文字は UUID 由来の**大文字英数字**
- **シート内で重複した場合だけ再生成する**

### 3.7 重複判定（同 §2.7）

`raw_inbox` の `line_message_id` 列を確認し、既に存在する場合は**行を追加せず 200 を返す。**

#### 3.7.1 読み取りは1回にまとめる

受付IDの重複確認（§3.6）と `line_message_id` の重複確認は、**1回の `values.get` で A列とB列をまとめて取得**して行う。項目ごとに `values.get` を呼ばないこと。

```text
range: raw_inbox!A:B
```

#### 3.7.2 競合について

Sheets には一意制約がないため、LINEの再送が極めて短い間隔で重なると重複行が書かれる可能性が残る。

これは**許容する。** 最終的な二重登録は下流の DB 側の `project_intakes.line_message_id` UNIQUE 制約で防がれ、CSV取込時に SKIPPED として処理される（Phase 4 実装済み）。多層防御になっている。

**この理由をコードのコメントに残すこと。** 後から「重複チェックが甘い」と誤解されないようにする。

### 3.8 許可判定（同 §2.8）

`settings` シートの A〜E列と照合する。

**優先順位**

```text
1. line_group_id の一致
2. line_user_id の一致
```

一致した行の `is_allowed` が `TRUE` なら許可。

| 判定 | `is_allowed` 列 | `status` 列 |
|---|---|---|
| 許可 | `TRUE` | `UNPROCESSED` |
| 未登録 / `FALSE` | `FALSE` | `IGNORED` |

**未許可でも原文は保存する。** ChatGPTの処理対象から外すだけである。

一致した行の `source_company` / `source_contact` を raw_inbox へ転記する。未登録の場合は空欄。

### 3.9 raw_inbox の列（同 §4.1）

13列（A〜M）。

| 列 | ヘッダー | 値 |
|---|---|---|
| A | `reception_id` | §3.6 |
| B | `line_message_id` | `event.message.id` |
| C | `line_user_id` | §3.5 |
| D | `line_group_id` | §3.5 |
| E | `source_company` | settings から転記 |
| F | `source_contact` | settings から転記 |
| G | `is_allowed` | `TRUE` / `FALSE` |
| H | `received_at` | ISO 8601 + `+09:00` |
| I | `message_type` | `text` |
| J | `raw_text` | `event.message.text`（**無加工**） |
| K | `status` | `UNPROCESSED` / `IGNORED` |
| L | `structured_at` | 空欄 |
| M | `error_message` | 空欄 |

`received_at` は `event.timestamp`（ミリ秒エポック）から生成する。サーバーの現在時刻ではない。

`raw_text` は**前後の空白も改行も一切変更しない。**

---

## 4. Sheets API の利用

### 4.1 クライアント構築

Phase 4 の Drive Client と同じ `JWT` を再利用できる形にする。スコープを追加する。

```ts
scopes: [
  "https://www.googleapis.com/auth/drive",
  "https://www.googleapis.com/auth/spreadsheets",
]
```

### 4.2 追記は必ず `valueInputOption: "RAW"`【セキュリティ上の必須事項】

```ts
await client.spreadsheets.values.append({
  spreadsheetId,
  range: "raw_inbox!A:M",
  valueInputOption: "RAW",          // ← 必須
  insertDataOption: "INSERT_ROWS",
  requestBody: { values: [row] },
});
```

**`USER_ENTERED` を使わないこと。**

`USER_ENTERED` はセルの値を数式として解釈する。LINE原文が `=` `+` `-` `@` で始まる場合、スプレッドシート上で**実行可能な数式になってしまう**。

基本設計 §17.5 と §18.10 は CSV に対する数式インジェクション対策を要求しているが、**同じ危険がスプレッドシートへの書き込みにも存在する。** `RAW` で保存すれば値は文字列のまま保持される。

原文の例:

```text
=HYPERLINK("http://evil.example.com","請求書")
@IMPORTXML(...)
```

これらが数式として動くと、スプレッドシートから外部への通信や意図しない参照が発生する。

### 4.3 settings の読み取り

```text
range: settings!A:E
```

システム設定（H列以降のKey/Value）は Phase 5 では読まない。Phase 5 が使う値はすべて環境変数から取る。

### 4.4 settings のキャッシュはしない

初期版では**毎回読む。** 受信量が少なく（1日数十件想定）、キャッシュすると許可設定の変更が即座に反映されない。

将来の最適化候補としてコメントを残してよいが、実装しない。

### 4.5 リトライ

Phase 4 の Drive Client と同じ方針。429 / 500 / 502 / 503 / 504 は指数バックオフで最大3回（1秒→2秒→4秒＋ジッター）。認証・権限エラーは再試行しない。

Phase 4 に実装済みの再試行処理を**共通化して再利用する。** 同等品を新規に書かない。

### 4.6 Route Handler の runtime

```ts
export const runtime = "nodejs";
```

---

## 5. ログ

**出力してよい**: `event` / `requestId` / `reception_id` / `line_message_id` / `is_allowed` / `status` / `elapsed_ms`

**出力禁止**: `LINE_CHANNEL_SECRET` / `LINE_CHANNEL_ACCESS_TOKEN` / `GOOGLE_PRIVATE_KEY` / **リクエスト本文全文** / **`raw_text` 全文** / `x-line-signature` の値

LINE-Sheets-GAS詳細設計 §2.9 は「raw body全文をログへ出さない」と明記している。デバッグ目的でも出力しない。

---

## 6. 性能

テスト・運用詳細設計 §11 の目標値。

```text
Webhook 1イベント: 5秒以内
```

`values.get`（重複確認）と `values.append`（追記）の2回のAPI呼び出しで完結させる。イベントごとに何度もAPIを呼ばない。

---

## 7. テスト要件

Vitest。Sheets API は `vi.mock` する。**実際のGoogle APIやLINEを叩くテストは書かない。**

セクション単位の消化状況を §10 の報告に必ず書くこと。

### A. 署名検証

1. 正しい署名 → 検証成功
2. 1文字改ざんした署名 → 401
3. `x-line-signature` ヘッダーなし → 401
4. 別のチャネルシークレットで生成した署名 → 401
5. 日本語・改行・絵文字を含む本文でも検証が成功する
6. 比較が `timingSafeEqual` である（`===` でない）
7. **署名検証前に JSON parse していない**（不正JSONかつ署名不正のとき 400 ではなく 401 が返る）

### B. イベント振り分け

8. `message` + `text` + `user` → 処理される
9. `message` + `text` + `group` → 処理される
10. `message` + `image` → 無視して200
11. `follow` / `unfollow` / `join` / `leave` / `postback` → 無視して200
12. `source.type = "room"` → 無視して200
13. **`events` 配列に複数イベント → 全件処理される**
14. 対象イベント0件でも200を返す

### C. 送信元と受付ID

15. `user` → `line_user_id` 設定・`line_group_id` 空欄
16. `group` → 両方設定
17. `group` で `source.userId` が無い → `line_user_id` 空欄
18. 受付IDが `RCP-YYYYMMDD-XXXXXXXX` 形式
19. 受付IDの日付が **JST** である（`TZ=UTC` でも変わらない）
20. シート内で重複した受付IDは再生成される
21. `received_at` が `event.timestamp` から生成され、`+09:00` 形式である

### D. settings 許可判定

22. `line_group_id` 一致が `line_user_id` 一致より優先される
23. 一致 + `is_allowed=TRUE` → `is_allowed=TRUE` / `status=UNPROCESSED`
24. 一致 + `is_allowed=FALSE` → `is_allowed=FALSE` / `status=IGNORED`
25. 未登録 → `is_allowed=FALSE` / `status=IGNORED`
26. 未許可でも **raw_inbox へ行が追記される**
27. `source_company` / `source_contact` が settings から転記される

### E. raw_inbox 書き込み

28. 13列が設計どおりの順序で並ぶ
29. `raw_text` が無加工（前後空白・改行が保持される）
30. **`valueInputOption` が `"RAW"` である**
31. `insertDataOption` が `"INSERT_ROWS"` である
32. `message_type` が `text` である

### F. 重複とエラー処理

33. 既存の `line_message_id` → 追記せず200
34. 重複確認が `values.get` 1回（A:B）で行われる
35. Sheets の `values.get` 失敗 → 503
36. Sheets の `values.append` 失敗 → 503
37. 複数イベントの途中で失敗 → 503
38. 本文1MiB超過 → 413
39. 署名は正しいがJSON不正 → 400

### G. セキュリティ

40. レスポンス本文に内部エラー詳細・スタックが含まれない
41. ログに `raw_text` 全文が出力されない
42. ログにリクエスト本文全文が出力されない
43. ログに署名値・シークレットが出力されない
44. 数式で始まる `raw_text`（`=HYPERLINK(...)`）が文字列として渡される

### H. 未設定時の動作

45. `LINE_CHANNEL_SECRET` 未設定でもアプリが起動する
46. `GOOGLE_SHEETS_SPREADSHEET_ID` 未設定でもアプリが起動する
47. 未設定時に Webhook を呼ぶと 503 を返す（500にしない）

---

## 8. 禁止事項

1. `@line/bot-sdk` などのLINE SDKを導入する
2. §2.1 の1パッケージ以外の依存を追加する
3. 署名検証の前に JSON parse・改行変換・文字列置換を行う
4. 署名の比較に `===` を使う
5. **`valueInputOption` に `USER_ENTERED` を使う**（数式インジェクション）
6. `events` 配列の先頭だけを処理する
7. `raw_text` を trim・改行変換・エスケープする
8. リクエスト本文全文・`raw_text` 全文・署名値・シークレットをログへ出力する
9. LINEへのレスポンスに内部エラーの詳細を含める
10. イベントごとに `values.get` を複数回呼ぶ
11. settings をキャッシュする
12. Phase 4 の再試行処理と同等品を新規に書く
13. GASでWebhookを受信する構成へ戻す
14. `structured_projects` / `export_batches` シートへ書き込む
15. `prisma/schema.prisma` を変更する
16. Phase 1〜4 の既存機能を壊す
17. 実際のGoogle API・LINE APIを叩くテストを書く
18. `any` で型エラーを回避する
19. 設計書にない仕様を推測で実装する

---

## 9. 完了条件

| # | 確認 | 期待 |
|---:|---|---|
| 1 | `npm run lint` | エラー0 |
| 2 | `npm run typecheck` | エラー0 |
| 3 | `npm run build` | 成功 |
| 4 | `npm run test` | 全件成功。§7 A〜H を網羅 |
| 5 | `docker build .` | 成功 |
| 6 | イメージサイズ | Phase 4 から大幅増でない（LINE SDK不使用の確認） |
| 7 | LINE/Sheets 未設定でアプリ起動 | 起動する。Phase 1〜4 の画面・APIが動く |
| 8 | 未設定時の Webhook | 503（500にならない） |
| 9 | 署名不正のWebhook | 401 |
| 10 | 正しい署名のWebhook（Sheetsモック） | 200 `{"received":true}` |
| 11 | `prisma/schema.prisma` | 差分なし |
| 12 | テーブル数 | 7のまま |
| 13 | `git grep` で秘密値 | 検出0件 |

### 9.1 実疎通は完了条件に含めない

LINE公式アカウントとスプレッドシートが未整備のため、実際のWebhook受信とSheets書き込みは**環境整備後に別途行う。**

`docs/10_環境整備/外部環境整備手順書.md` §7.5 のとおり、LINE Webhook URLの登録と検証は Phase 5 デプロイ後の作業である。

---

## 10. 報告フォーマット

```text
## 実装したファイル

## §7 テスト要件の消化状況
A 署名検証            : 実装 / 一部（内訳） / 未実装
B イベント振り分け    : 〃
C 送信元と受付ID      : 〃
D settings許可判定    : 〃
E raw_inbox書き込み   : 〃
F 重複とエラー処理    : 〃
G セキュリティ        : 〃
H 未設定時の動作      : 〃

一部・未実装がある場合は、項目番号と理由を明記すること。

## §9 完了条件の実行結果
（#1〜#13 それぞれの実結果。失敗したものは失敗と書く）

## 設計と異なる判断をした箇所

## 未実装・積み残し

## 判断を仰ぎたい点
```

失敗した項目を「成功」と報告しない。

---

## 11. 作業手順

```text
1. 最新の main から feature/phase5-line-sheets を作成（切り替えを報告する）
2. @googleapis/sheets を追加
3. Sheets Client → 署名検証 → イベント振り分け → 許可判定 →
   raw_inbox書込 → Route Handler の順に実装
4. §7 のテストを A〜H すべて実装
5. §9 の完了条件を全項目実行
6. 意味のある単位で複数コミット
7. main 向け Pull Request を作成
```

PR本文に §10 の報告内容を含める。**main へ直接pushしない。**
