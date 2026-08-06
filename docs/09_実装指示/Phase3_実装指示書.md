# Phase 3 実装指示書 — 画面

作成日時: 2026-08-06 15:10 +09:00
対象リポジトリ: `abikohiroken/ses-project-manager`
作業ブランチ: `feature/phase3-ui`（最新 `main` から作成すること）

---

## 0. 実装AIへの前提

### 0.1 あなたの役割

`docs/` の設計一式に従い、**Phase 3（画面）のみ**を実装する。

設計は確定している。**設計を作り直さない。設計に書かれていない仕様を発明しない。**

### 0.2 文書の優先順位

```text
1. docs/09_実装指示/設計差分_v1.2_実装前確定事項.md
2. 本書（Phase3_実装指示書.md）
3. docs/05_画面/画面詳細設計書_v1.0.md
4. docs/04_API/API詳細設計書_v1.0.md
5. docs/09_実装指示/Phase2_実装指示書.md（実装済みAPIの仕様）
6. docs/01_基本設計/基本設計_v2.5差分_LINE受信経路修正.md
7. docs/01_基本設計/SES案件管理WEBアプリ_基本設計書_v2.4_確定版.md
```

### 0.3 判断に迷ったら

設計書に答えがない事項を見つけたら、**推測して実装せず、作業を止めて質問する。**

Phase 2 着手前の照会4件は適切だった。同じように扱うこと。

### 0.4 作業ディレクトリの共有について

このリポジトリの作業ディレクトリは設計担当と共有している。**ブランチを切り替えたら必ず報告すること。** 切り替えたまま放置すると、設計担当のコミットが意図しないブランチへ乗る。

---

## 1. スコープ

### 1.1 実装する

| 画面ID | 画面 | パス |
|---|---|---|
| SCR-001 | ログイン | `/login`（Phase 1で実装済み。§5.1の範囲で調整） |
| SCR-002 | 確認待ち案件一覧 | `/project-intakes` |
| SCR-003 | 案件確認 | `/project-intakes/{id}` |
| SCR-004 | 正式案件一覧 | `/projects` |
| SCR-005 | 正式案件詳細・編集 | `/projects/{id}` |
| SCR-006 | CSV取込履歴 | `/csv-imports` |
| SCR-007 | ユーザー管理 | `/admin/users` |

あわせて共通UI部品（§4）と表示整形の純粋関数（§7）。

### 1.2 実装しない

- CSVパーサー・Drive Client・取込処理（Phase 4）
- 内部Cron API（Phase 4）
- LINE Webhook・Google Sheets連携（Phase 5）
- GAS・ChatGPTプロンプト（Phase 6）
- **新規APIの追加**（Phase 2の19エンドポイントで足りる。足りないと判断したら実装せず報告する）

---

## 2. 技術方針【確定】

### 2.1 UI部品は Tailwind のみで自前実装する

**コンポーネントライブラリを導入しない。** shadcn/ui、MUI、Radix 等を入れない。

理由: 画面は7つ、必要な部品は10種程度と少なく、依存追加による Tailwind v4 / React 19 / Next 16 との適合確認コストと保守責任に見合わない。

### 2.2 データ取得は Server Component 中心

| 用途 | 方式 |
|---|---|
| 一覧・詳細の**表示** | Server Component から `src/lib/services/*` を**直接呼ぶ** |
| **更新**操作 | Client Component から既存REST APIへ `fetch` |

#### 2.2.1 Server Component から自分自身のAPIを fetch しない

**禁止**: Server Component 内で `fetch("/api/project-intakes")` のように自分のHTTP APIを呼ぶこと。

理由:

- 同一プロセス内で不要なHTTP往復が発生する
- 認証Cookieの転送を自前で行う必要があり、事故の温床になる
- 初回表示が遅くなる

Phase 2 のサービス層（`src/lib/services/*`）と権限ガード（`requireRole` / `requireWriteRole`）は Server Component からそのまま呼べる。`getServerSession` は RSC で動作する。

```ts
// Server Component
const user = await requireRole("ADMIN", "OPERATOR", "VIEWER");
const result = await listProjectIntakes(query);
```

#### 2.2.2 Server Actions を使わない

更新経路は **Phase 2 のREST API に一本化する。** Server Actions を追加しない。

理由: REST API は API詳細設計で定めた仕様の正本であり、既に実装・テスト済みである。Server Actions を併用すると認証・検証の経路が二重になり、片方だけ穴が空く。

### 2.3 Next.js 16 の作法（同梱ドキュメントで実測確認済み）

```ts
// page.tsx — params も searchParams も Promise
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { id } = await params;
  const query = await searchParams;
}
```

`cookies()` / `headers()` も async である（`await cookies()`）。

### 2.4 依存パッケージ

**追加しない。** 必要と判断したら実装を止めて報告すること。

---

## 3. ディレクトリ構成

```text
src/
├─ app/
│  ├─ login/page.tsx                      SCR-001（既存）
│  └─ (main)/
│     ├─ layout.tsx                        既存。ナビを有効化する
│     ├─ project-intakes/
│     │  ├─ page.tsx                       SCR-002
│     │  └─ [id]/page.tsx                  SCR-003
│     ├─ projects/
│     │  ├─ page.tsx                       SCR-004
│     │  └─ [id]/page.tsx                  SCR-005
│     ├─ csv-imports/page.tsx              SCR-006
│     └─ admin/users/page.tsx              SCR-007
├─ components/
│  ├─ ui/                                  汎用部品（§4.1）
│  └─ features/                            画面固有のClient Component
└─ lib/
   └─ format/                              表示整形の純粋関数（§7）
```

Server Component と Client Component を明確に分ける。`"use client"` を付けるのは**操作を伴う部品だけ**にする。ページ全体をClient Componentにしない。

---

## 4. 共通UI部品

### 4.1 `src/components/ui/`

必要最小限を作る。汎用化しすぎない。

```text
Button / Input / Select / Textarea / Table / Modal
Badge / Toast / TagInput / Pagination / EmptyState
```

- `TagInput` は必須スキル・尚可スキルの入力に使う（画面設計 §4.4）
- `Modal` は統合モーダル・確認ダイアログに使う。**開いたときにフォーカスを移し、閉じたら元のボタンへ戻す**（画面設計 §9）
- `Toast` は保存成功の一時通知（画面設計 §1.3）

### 4.2 共通表示ルール（画面設計 §1.3）

| 対象 | 形式 |
|---|---|
| 日時 | `YYYY/MM/DD HH:mm` |
| 月 | `YYYY/MM` |
| 単価 | `60〜70万円`。片側のみなら `60万円〜` / `〜70万円` |
| 空値 | `—` |
| 必須エラー | フィールド直下に赤字 |
| 保存成功 | 画面上部の一時通知 |
| API失敗 | 操作内容を維持したままエラー表示 |
| 二重送信防止 | 処理中はボタンを `disabled` |

---

## 5. 各画面

基本仕様は `docs/05_画面/画面詳細設計書_v1.0.md` に従う。以下はそこに書かれていない確定事項である。

### 5.1 SCR-001 ログイン（既存）

Phase 1 で実装済み。以下だけ確認・調整する。

- `?error=` の3種（`NOT_REGISTERED` / `INACTIVE` / その他）の文言が画面設計 §2.4 と一致すること
- **エラー画面にメールアドレスや内部情報を出さないこと**

### 5.2 SCR-002 確認待ち案件一覧

- 初期条件: `reviewStatus=PENDING` / `receivedAt` 降順 / `pageSize=50`
- **検索条件は URL の searchParams に保持する**（画面設計 §3.7）。クライアント状態だけで持たない。ブラウザバック・リロード・URL共有で同じ結果になること
- 上部に連携状態を表示する（`GET /api/integration-status`）
- **Drive接続がエラーでも案件一覧は表示できること**（画面設計 §3.3）。連携状態の取得失敗で画面全体を落とさない

Phase 2 時点で Drive はスタブのため `connected: false` が返る。**これは不具合ではない**（Phase2指示書 §5.4.1）。「Drive接続: エラー」と表示されるのが正しい挙動である。

### 5.3 SCR-003 案件確認

**この画面が本システムの中核である。** 画面設計 §4 を精読すること。

- PC: 左に編集可能な構造化項目、右に編集不可のLINE原文。スマートフォンは縦配置
- AI初期値（`aiSnapshot`）と現在値が異なる項目に `AI値から修正済み` を表示する
- AI初期値は**閲覧のみ**。編集不可
- 保存は `PATCH`。成功後に `updatedAt` を更新し、**画面遷移しない**
- 警告コード（`warningCodes`）は保存時に自動消去しない
- 正式登録は案件名が空欄なら実行不可。ボタンを押せない状態にし、案件名へフォーカスを移す

#### 5.3.1 LINE原文の表示（基本設計 §17.4・最重要）

- **`dangerouslySetInnerHTML` を使わない**
- HTMLタグは文字列としてそのまま表示する
- 改行を保持する（`whitespace-pre-wrap`）
- URLのリンク化は **`http` と `https` のプロトコルだけ**を対象とする。`javascript:` `data:` `vbscript:` 等は絶対にリンクにしない
- 原文をコピーするボタンを置く

URLリンク化は正規表現で雑に実装しない。プロトコル判定を明示的に行い、判定関数を純粋関数として切り出して §7 でテストすること。

#### 5.3.2 統合モーダル（画面設計 §4.9）

1. 既存案件を検索する
2. 対象案件を選択する
3. 反映する項目にチェックを入れる（**初期状態はすべて未選択**）
4. 実行確認

選択した案件の `updatedAt` を保持し、実行時に `targetProjectUpdatedAt` として送信する（設計差分v1.2 §5）。これを送らないとAPIが検証できない。

#### 5.3.3 競合時（409）の扱い（画面設計 §4.11）

```text
この案件は別の操作で更新されています。
最新情報を再読み込みしてください。
```

**入力値を保持したまま**表示し、再読み込みするかを利用者に選ばせる。勝手に再読込して入力を捨てない。

### 5.4 SCR-004 正式案件一覧

- 初期検索で `ARCHIVED` を除外する
- 状態表示: OPEN=募集中 / ON_HOLD=保留 / CLOSED=募集終了 / ARCHIVED=アーカイブ
- 検索条件はURLに保持する

### 5.5 SCR-005 正式案件詳細・編集

- タブを作らず1ページに配置する（案件情報 / 関連LINE原文 / 取込元情報）
- 関連原文は受信日時降順。intakeの処理種別（REVIEWED / MERGED）を表示する
- 状態操作ボタンは現在状態に応じて出し分ける（画面設計 §6.4）
- 各状態操作は確認ダイアログを表示する
- 原文の表示は §5.3.1 と同じ規則に従う

### 5.6 SCR-006 CSV取込履歴

- 詳細は同一画面のサイドパネルまたはモーダルで表示する
- **`rawData` は ERROR 行を開いたときだけ取得する**。取得は `GET /api/csv-imports/{id}?rawDataRowId=<行ID>`（Phase2指示書 §12.3）
- 一覧・通常の詳細では `rawData` を要求しない
- **原文全文はこの画面に表示しない**（画面設計 §7.4）
- `MOVE_PENDING` は警告表示にする
- `SKIPPED` の `errorCode` は終了理由（`FILE_DUPLICATE` / `ALL_ROWS_SKIPPED`）であり、**エラーとして赤字表示しない**（設計差分v1.2 §1.3）

### 5.7 SCR-007 ユーザー管理

- ADMIN のみ。他ロールがURL直打ちしたら一覧を表示せずエラーにする
- 一覧は `email` 昇順。無効ユーザーも表示する
- **最後の有効ADMINは無効化・降格できない**。APIが409を返すので、画面はそのエラーを分かりやすく表示する

---

## 6. 横断ルール

### 6.1 権限制御（基本設計 §16.2・禁止事項）

**画面での非表示だけで済ませない。**

| ロール | 挙動 |
|---|---|
| VIEWER | 入力欄を `readonly`、更新・状態変更ボタンを非表示 |
| OPERATOR | 案件の確認・編集・登録が可能。ユーザー管理は不可 |
| ADMIN | 全操作 |

APIは既にサーバー側で403を返す（Phase 2で検証済み）。画面側の制御は**利便性のためであり、防御の主体ではない**。両方を実装する。

ナビの「ユーザー管理」は ADMIN のときだけ表示する。

### 6.2 日時の表示（重要）

APIは ISO 8601 + `+09:00` で返す。画面は `YYYY/MM/DD HH:mm` へ整形する。

**`toLocaleString()` を引数なしで使わない。** 閲覧者のブラウザのタイムゾーンに依存し、海外からのアクセスや検証環境で表示がずれる。

整形は**JST固定**で行う。`src/lib/format/` に純粋関数として実装し、§7 でテストする。

Phase 2 の `src/lib/api/datetime.ts` に `toJstIso` があるが、これはAPI出力用である。画面表示用の整形関数は別に作ってよい。

### 6.3 エラー表示

- APIのエラーレスポンスは `{ error: { code, message, details } }` 形式
- `message` は利用者向けの日本語が入っている。**これをそのまま表示してよい**
- `details[].field` があればその項目の直下に `reason` を表示する
- `code` を利用者にそのまま見せない

### 6.4 アクセシビリティ（画面設計 §9）

- `label` と `input` を関連付ける
- 色だけで状態を示さない（アイコンまたはテキストを併記）
- エラーはテキストで表示する
- フォーカス表示を消さない
- ダイアログ開閉時のフォーカス移動
- 表の横スクロールを許可する
- ボタン文言は動作を明示する

---

## 7. テスト要件

**画面のDOMテストは行わない。** React Testing Library 等を導入しない（依存追加の禁止）。画面の振る舞いは Phase 7 の E2E（テスト・運用詳細設計 §7 の E2E-001〜008）で担保する。

代わりに、**判断ロジックと表示整形を純粋関数として切り出し、Vitest でテストする。** コンポーネント内にロジックを埋め込まないこと。

セクション単位の消化状況を §9 の報告に必ず書くこと。

### A. 表示整形（`src/lib/format/`）

1. 日時: `2026-08-06T14:20:30+09:00` → `2026/08/06 14:20`
2. 日時: **`TZ=UTC` でも同じ結果になる**（ローカルタイム非依存の証明）
3. 月: `2026-09` → `2026/09`
4. 単価: 両方あり → `60〜70万円` / 下限のみ → `60万円〜` / 上限のみ → `〜70万円` / 両方なし → `—`
5. 空値・null・空文字 → `—`

### B. 原文のURLリンク化（§5.3.1・セキュリティ）

6. `http://example.com` → リンクになる
7. `https://example.com` → リンクになる
8. `javascript:alert(1)` → **リンクにならない**（文字列のまま）
9. `data:text/html,<script>` → **リンクにならない**
10. `vbscript:msgbox(1)` → **リンクにならない**
11. `<script>alert(1)</script>` を含む原文 → タグが文字列として保持される
12. 改行が保持される

### C. 権限による出し分け

13. VIEWER: 更新系ボタンの表示可否を返す判定関数が `false` を返す
14. OPERATOR: 案件操作は `true`、ユーザー管理は `false`
15. ADMIN: すべて `true`

### D. 状態別の操作可否（画面設計 §6.4）

16. OPEN → 保留 / 募集終了 / アーカイブ が選べる
17. ON_HOLD → 再開 / アーカイブ
18. CLOSED → 再募集 / アーカイブ
19. ARCHIVED → 操作なし

### E. AI初期値との差分判定（§5.3）

20. `aiSnapshot` と現在値が同じ → 差分なし
21. 異なる → 差分あり
22. 配列（スキル）の比較が順序を含めて正しく判定される
23. `null` と空文字を同一視しない／するかの扱いが一貫している

### F. CSV履歴の表示判定（§5.6）

24. `SKIPPED` + `FILE_DUPLICATE` → エラー表示にしない
25. `SKIPPED` + `ALL_ROWS_SKIPPED` → エラー表示にしない
26. `ERROR` → エラー表示にする
27. `MOVE_PENDING` → 警告表示にする

---

## 8. 禁止事項

1. コンポーネントライブラリ・その他の依存パッケージを追加する
2. Server Component から自分自身のHTTP API を `fetch` する
3. Server Actions を追加する
4. 新規APIエンドポイントを追加する
5. `dangerouslySetInnerHTML` を使う
6. `javascript:` `data:` `vbscript:` 等をリンク化する
7. VIEWER の制御を画面の非表示だけで済ませる
8. `toLocaleString()` 等でブラウザのタイムゾーンに依存した日時表示をする
9. 検索条件をURLに保持せずクライアント状態だけで持つ
10. 409競合時に利用者の入力を破棄して再読込する
11. ページ全体を `"use client"` にする
12. コンポーネント内に判断ロジックを埋め込み、テスト不能にする
13. CSV履歴画面に原文全文を表示する
14. `prisma/schema.prisma` を変更する
15. `any` で型エラーを回避する
16. 設計書にない仕様を推測で実装する

---

## 9. 完了条件

**すべて実際に実行し、結果を報告する。**

| # | 確認 | 期待 |
|---:|---|---|
| 1 | `npm run lint` | エラー0 |
| 2 | `npm run typecheck` | エラー0 |
| 3 | `npm run build` | 成功 |
| 4 | `npm run test` | 全件成功。§7 A〜F を網羅 |
| 5 | `docker build .` | 成功 |
| 6 | 7画面すべてが表示される | ADMINでログインし各URLを開く |
| 7 | VIEWER でログイン | 更新ボタンが出ず、入力欄が readonly |
| 8 | OPERATOR で `/admin/users` | 一覧が表示されない |
| 9 | 案件確認画面で保存 | 200・一時通知・画面遷移しない |
| 10 | 2画面で同じ案件を開き後から保存 | 409メッセージが出て**入力値が保持される** |
| 11 | 正式登録 | 正式案件詳細へ遷移する |
| 12 | 原文にHTMLタグ・`javascript:` を含むデータ | スクリプトが実行されず文字列表示 |
| 13 | スマートフォン幅（375px） | 案件確認画面が縦配置になる |
| 14 | `prisma/schema.prisma` | 差分なし |
| 15 | `git grep` で秘密値 | 検出0件 |

### 9.1 検証用データ

ローカルDBへ検証用の `project_intakes` / `project_sources` / `projects` / `csv_imports` を投入して確認する。

**#12 の確認には、原文へ次を含むデータを必ず入れること。**

```text
<script>alert(1)</script>
<img src=x onerror=alert(1)>
javascript:alert(1)
https://example.com
（改行を含む複数行）
```

検証後にデータを削除し、残存0件を確認すること。

---

## 10. 報告フォーマット

```text
## 実装したファイル
（パス一覧）

## §7 テスト要件の消化状況
A 表示整形          : 実装 / 一部（内訳） / 未実装
B 原文のURLリンク化 : 〃
C 権限による出し分け : 〃
D 状態別の操作可否   : 〃
E AI初期値との差分   : 〃
F CSV履歴の表示判定  : 〃

一部・未実装がある場合は、項目番号と理由を明記すること。

## §9 完了条件の実行結果
（#1〜#15 それぞれの実結果。失敗したものは失敗と書く）

## 設計と異なる判断をした箇所
（なければ「なし」）

## 未実装・積み残し
（Phase 4以降へ送ったもの）

## 判断を仰ぎたい点
（設計書に答えがなく、推測を避けた事項）
```

失敗した項目を「成功」と報告しない。

---

## 11. 作業手順

```text
1. 最新の main から feature/phase3-ui を作成（切り替えたことを報告する）
2. §4 共通UI部品 → §5 各画面 の順に実装
3. §7 のテストを A〜F すべて実装
4. §9 の完了条件を全項目実行
5. 意味のある単位で複数コミット
6. main 向け Pull Request を作成
```

PR本文に §10 の報告内容を含める。**main へ直接pushしない。**
