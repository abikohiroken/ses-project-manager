# Phase 1 実装指示書 — 基盤構築

作成日時: 2026-08-05 16:30 +09:00
対象リポジトリ: `abikohiroken/ses-project-manager`
作業ブランチ: `feature/phase1-foundation`

---

## 0. 実装AIへの前提

### 0.1 あなたの役割

このリポジトリの `docs/` にある設計一式に従い、**Phase 1のみ**を実装する。

設計は既に確定している。**設計を作り直さない。設計に書かれていない仕様を発明しない。**

### 0.2 文書の優先順位

矛盾がある場合、上にあるものを優先する。

```text
1. docs/09_実装指示/設計差分_v1.2_実装前確定事項.md
2. 本書（Phase1_実装指示書.md）
3. docs/02_DB-Prisma/ 〜 docs/08_テスト-運用/ の各詳細設計書
4. docs/01_基本設計/基本設計_v2.5差分_LINE受信経路修正.md
5. docs/01_基本設計/SES案件管理WEBアプリ_基本設計書_v2.4_確定版.md
```

基本設計 v2.4 は最も古い。詳細設計と矛盾する箇所が複数あるため、単独で根拠にしない。

### 0.3 判断に迷ったら

設計書に答えがない事項を見つけた場合、**推測して実装せず、作業を止めて質問する**。

「たぶんこうだろう」で実装した箇所は、後工程で必ず手戻りになる。

---

## 1. スコープ

### 1.1 実装する（Phase 1）

- Next.js + TypeScript + Tailwind CSS プロジェクト
- PostgreSQL + Prisma（スキーマ適用・初期マイグレーション・seed）
- Auth.js による Google OAuth ログイン
- RBAC（ADMIN / OPERATOR / VIEWER）の共通基盤
- API共通基盤（レスポンス封筒・エラーコード・requestId）
- `GET /api/health`
- 共通レイアウト（ヘッダー・ナビ）とログイン画面
- Dockerfile（マルチステージ）
- `.env.example`
- テスト基盤（Vitest）と最小のユニットテスト

### 1.2 実装しない（Phase 2以降）

以下は**絶対に実装しない**。ファイルも作らない。

- `project-intakes` / `projects` / `csv-imports` / `users` の各API（Phase 2）
- 確認待ち一覧・案件確認・正式案件・CSV履歴・ユーザー管理の各画面（Phase 3）
- CSVパーサー・Drive連携・取込処理（Phase 4）
- LINE Webhook・Google Sheets連携（Phase 5）
- GAS・ChatGPTプロンプト（Phase 6）

「ついでに作っておく」ことをしない。Phase 1のレビューが通らなくなる。

---

## 2. 技術スタックとバージョン

| 区分 | 確定 |
|---|---|
| Node.js | 22 LTS |
| パッケージマネージャ | npm |
| フレームワーク | Next.js 16（16.3.x系）App Router |
| 言語 | TypeScript（`strict: true`） |
| UI | Tailwind CSS（`create-next-app`の既定に従う） |
| ORM | Prisma 7（7.9.x系）+ `@prisma/adapter-pg` |
| DB | PostgreSQL 16 |
| 認証 | **next-auth 4.24.15（安定版・正確指定）**。設計差分v1.2 §13 |
| バリデーション | Zod |
| テスト | Vitest |
| Lint / Format | ESLint + Prettier |

### 2.1 Tailwind CSS の注意

`create-next-app` が生成した構成をそのまま使う。

v4系が生成された場合、**v3の書き方を混在させない**。

- `globals.css` は `@import "tailwindcss";`
- `@tailwind base;` / `@tailwind components;` / `@tailwind utilities;` を書かない
- `tailwind.config.js` の `content` 配列を手で足さない

### 2.1.1 Next.js 16 の変更点【2026-08-05 追記・確定】

Next.js 16 で本指示書に影響する破壊的変更が2件ある。いずれも検証済み。

| 変更 | 影響 |
|---|---|
| `next lint` が削除された | `"lint": "next lint"` は `lint` をディレクトリ引数と解釈して失敗する。**`"lint": "eslint ."` を使う** |
| Middleware が **Proxy** へ改称された | ファイル規約が `middleware.ts` → **`proxy.ts`**。関数名も `proxy` |

`middleware.ts` は後方互換で動作するが警告が出るため使わない。Next.js 16 の正式規約である `proxy.ts` を使うこと。

バージョンは `create-next-app@latest` が生成する 16.3.x をそのまま使う。`package-lock.json` を必ずコミットし、ビルドを再現可能にすること。

16.3.0 は2026-08-03リリースと新しいため、Phase 1 の作業中に明確な不具合を踏んだ場合は 16.2.12 への固定を提案してよい（自己判断で固定せず、報告すること）。

### 2.2 Prisma を dependencies に含める

本番コンテナ起動時に `prisma migrate deploy` を実行するため、`prisma` パッケージを **devDependencies ではなく dependencies** に入れる。

`@prisma/client` / `@prisma/adapter-pg` / `pg` も dependencies。

### 2.3 Prisma 7 対応【2026-08-05 追記・確定】

`docs/02_DB-Prisma/schema.prisma` は Prisma 6 形式で書かれており、Prisma 7 ではそのまま使えない。

検証済みの事実:

| 項目 | 検証結果 |
|---|---|
| `datasource` の `url = env("DATABASE_URL")` | **Prisma 7 では P1012 エラー。削除が必須** |
| `generator provider = "prisma-client-js"` | **Prisma 7 でも正常動作。変更不要** |
| モデル・enum・インデックス定義 | **完全互換。7テーブル / 7 enum / 34インデックスを設計どおり生成** |
| `PrismaClient` の生成 | ドライバアダプタ必須。アダプタなしは実行時エラー |

確定判断:

**`schema.prisma` の変更許可は `datasource` ブロックの `url` 行の削除だけとする。**

`model` / `enum` / `@@index` / `@@map` / 型・制約は**1バイトも変更しない**。この禁止の目的はDB設計v1.1で確定したデータモデルを保護することであり、接続設定のボイラープレートは対象外である。

#### 2.3.1 schema.prisma の変更内容

```prisma
// 変更前（Prisma 6形式）
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// 変更後（Prisma 7形式）
datasource db {
  provider = "postgresql"
}
```

`generator client { provider = "prisma-client-js" }` は**そのまま維持する**。`prisma-client` への変更やoutput指定の追加をしない。

#### 2.3.2 prisma.config.ts（リポジトリ直下・新規作成）

```ts
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
});
```

Prisma CLI がこのファイルを追加ツールなしで読み込むことは検証済み。

#### 2.3.3 PrismaClient のインスタンス化

`src/lib/prisma.ts` はアダプタ経由で生成する。

```ts
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
// globalThis へキャッシュするシングルトンにする
```

アダプタなしの `new PrismaClient()` は実行時に失敗する。

#### 2.3.4 CLIフラグの変更

Prisma 7 で `prisma migrate diff` のフラグが変わっている。使う場合は注意する。

```text
--to-schema-datamodel  →  --to-schema（旧フラグは削除済み）
```

#### 2.3.5 DATABASE_URL がビルド時にも必要

`prisma.config.ts` が `env("DATABASE_URL")` を参照するため、**`prisma generate` も DATABASE_URL が未設定だと失敗する**。

Dockerのビルド段階では実DBへ接続しないが、変数の存在は必要になる。§4.10 の対応に従うこと。

---

## 3. ディレクトリ構成

```text
ses-project-manager/
├─ docs/                          # 設計一式（変更しない）
├─ prisma/
│  ├─ schema.prisma               # docs/02_DB-Prisma/schema.prisma をコピー（内容変更禁止）
│  ├─ migrations/
│  │  └─ <timestamp>_init/
│  │     └─ migration.sql
│  └─ seed.ts
├─ src/
│  ├─ app/
│  │  ├─ layout.tsx               # ルートレイアウト
│  │  ├─ globals.css
│  │  ├─ page.tsx                 # / → /project-intakes へリダイレクト
│  │  ├─ login/
│  │  │  └─ page.tsx              # SCR-001
│  │  ├─ (main)/
│  │  │  ├─ layout.tsx            # ヘッダー + ナビ（認証必須）
│  │  │  └─ project-intakes/
│  │  │     └─ page.tsx           # Phase 3までのプレースホルダ
│  │  └─ api/
│  │     ├─ auth/[...nextauth]/route.ts
│  │     └─ health/route.ts
│  ├─ auth.ts                     # Auth.js 設定
│  ├─ proxy.ts                    # Next.js 16 の Proxy（旧 middleware.ts）
│  ├─ lib/
│  │  ├─ env.ts                   # 環境変数のZod検証
│  │  ├─ prisma.ts                # PrismaClient シングルトン
│  │  └─ api/
│  │     ├─ errors.ts             # エラーコード定義
│  │     ├─ response.ts           # レスポンス封筒
│  │     └─ guard.ts              # 認証・RBAC
│  └─ types/
│     └─ next-auth.d.ts           # Session型拡張
├─ tests/
│  └─ unit/
├─ .env.example
├─ .dockerignore
├─ .gitignore
├─ Dockerfile
├─ next.config.ts
├─ package.json
├─ tsconfig.json
├─ vitest.config.ts
└─ README.md
```

`scripts/` は Phase 4 で作る。今は作らない。

---

## 4. 実装項目

### 4.1 プロジェクト初期化

`create-next-app` で以下の構成を作る。

- TypeScript: あり
- ESLint: あり
- Tailwind CSS: あり
- `src/` ディレクトリ: あり
- App Router: あり
- import alias: `@/*`

`package.json` の scripts:

```json
{
  "dev": "next dev",
  "build": "prisma generate && next build",
  "start": "next start",
  "lint": "eslint .",
  "typecheck": "tsc --noEmit",
  "format": "prettier --write .",
  "test": "vitest run",
  "db:migrate": "prisma migrate dev",
  "db:deploy": "prisma migrate deploy",
  "db:seed": "tsx prisma/seed.ts"
}
```

### 4.2 Prisma

#### 4.2.1 スキーマ

`docs/02_DB-Prisma/schema.prisma` を `prisma/schema.prisma` へコピーする。

変更してよいのは **§2.3.1 の `datasource` ブロックの `url` 行削除だけ**。

`model` / `enum` / フィールド / 型 / `@@index` / `@@map` / `@unique` は**1バイトも変更しない**。モデル追加・フィールド追加・Auth.js用モデル追加をしない。

#### 4.2.2 初期マイグレーション

```bash
npx prisma migrate dev --name init
```

生成された `prisma/migrations/<timestamp>_init/migration.sql` の**末尾に**、`docs/02_DB-Prisma/database_constraints.sql` の内容を追記する。

このファイルは**設計差分v1.2 §1 を適用済み**である。`csv_imports_duplicate_state_ck` が以下の形になっていることを確認してから使うこと。旧定義（`"status" = 'SKIPPED' AND "duplicate_of_import_id" IS NOT NULL`）が残っていたら、それは古いコピーである。

```sql
ADD CONSTRAINT "csv_imports_duplicate_state_ck"
CHECK (
  "duplicate_of_import_id" IS NULL
  OR "status" = 'SKIPPED'
);
```

末尾のコメントアウトされた pg_trgm 部分は追記しない。

追記後、DBをリセットして再適用し、全制約が作成されることを確認する。

```bash
npx prisma migrate reset
```

#### 4.2.3 PrismaClient

`src/lib/prisma.ts` で開発時のホットリロード対策込みのシングルトンを作る。

```ts
// globalThis へキャッシュし、開発時のコネクション枯渇を防ぐ
```

#### 4.2.4 seed

`prisma/seed.ts` は `INITIAL_ADMIN_EMAIL` / `INITIAL_ADMIN_NAME` から ADMIN ユーザーを1件 upsert する。

- email は trim + lowercase して保存する（`users_email_lowercase_ck` 制約があるため必須）
- 環境変数が未設定なら何もせず正常終了する
- 既存ユーザーがいる場合、role を強制的にADMINへ戻さない（name のみ更新）

### 4.3 環境変数

`src/lib/env.ts` で Zod による検証を行い、不正なら**起動時に落とす**。

Phase 1 で必須:

```text
DATABASE_URL
AUTH_SECRET
AUTH_GOOGLE_ID
AUTH_GOOGLE_SECRET
APP_URL
```

Phase 1 では任意（Phase 4以降で必須になる）:

```text
GOOGLE_PROJECT_ID
GOOGLE_CLIENT_EMAIL
GOOGLE_PRIVATE_KEY
GOOGLE_SHEETS_SPREADSHEET_ID
GOOGLE_DRIVE_ROOT_FOLDER_ID
GOOGLE_DRIVE_INBOX_FOLDER_ID
GOOGLE_DRIVE_PROCESSED_FOLDER_ID
GOOGLE_DRIVE_ERROR_FOLDER_ID
LINE_CHANNEL_SECRET
LINE_CHANNEL_ACCESS_TOKEN
CRON_SECRET
INITIAL_ADMIN_EMAIL
INITIAL_ADMIN_NAME
```

`docs/07_Drive-Dokploy/.env.example` は**設計差分v1.2 §7 を適用済み**（`AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` / `AUTH_TRUST_HOST` 追加済み）である。これをリポジトリ直下へコピーする。

**すべての値を空のまま維持する。フォルダIDやドメインの実値を書き込まない。**

### 4.4 Auth.js

設計差分v1.2 §6 に従う。

**採用版は next-auth 4.24.15（安定版）。v5 betaは使わない。** 理由と v4/v5 のAPI差分は設計差分v1.2 §13 を必ず読むこと。

`package.json` は `"next-auth": "4.24.15"` と**正確指定**する（caretを付けない）。

#### 4.4.1 設定（`src/auth.ts`）

`NextAuthOptions` をエクスポートする。v5の `export const { auth, handlers } = NextAuth({...})` の形にしない。

```ts
import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";

export const authOptions: NextAuthOptions = { /* ... */ };
```

- Provider: Google のみ。`clientId` / `clientSecret` に `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` を明示的に渡す
- `session.strategy = "jwt"`
- `session.maxAge = 8 * 60 * 60`（8時間）
- Prisma Adapter は**使わない**
- `pages.signIn = "/login"`
- `pages.error = "/login"`

ルートハンドラ `src/app/api/auth/[...nextauth]/route.ts`:

```ts
import NextAuth from "next-auth";
import { authOptions } from "@/auth";

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
```

サーバー側でセッションを取る箇所（`guard.ts` など）は `getServerSession(authOptions)` を使う。

```ts
import { getServerSession } from "next-auth/next";
```

#### 4.4.2 signIn callback

```text
1. profile.email が存在しなければ拒否
2. trim + lowercase
3. prisma.user.findUnique({ where: { email } })
4. 該当なし → 拒否（理由コード: NOT_REGISTERED）
5. isActive === false → 拒否（理由コード: INACTIVE）
6. lastLoginAt を現在時刻で更新
7. 許可
```

拒否理由は `/login?error=<コード>` で画面へ伝え、画面詳細設計 §2.4 の文言を表示する。

| コード | 表示文言 |
|---|---|
| NOT_REGISTERED | このアカウントは利用登録されていません |
| INACTIVE | このアカウントは無効です |
| その他 | ログインに失敗しました |

**エラー画面にメールアドレスや内部情報を出さない。**

#### 4.4.3 jwt / session callback

- jwt: 初回サインイン時に `token.userId` / `token.role` を格納
- session: `session.user.id` / `session.user.role` を公開
- `src/types/next-auth.d.ts` で型拡張する（`any` を使わない）

### 4.5 RBAC 共通基盤（`src/lib/api/guard.ts`）

以下を実装する。

```ts
// セッション必須。未認証は AUTH_REQUIRED (401)
requireSession(): Promise<SessionUser>

// 参照系。JWTのroleで判定してよい
requireRole(...roles: UserRole[]): Promise<SessionUser>

// 更新系。DBのusersを都度参照して isActive と role を確認する
requireWriteRole(...roles: UserRole[]): Promise<SessionUser>
```

`requireWriteRole` が DB を参照するのは設計差分v1.2 §6.4 の確定事項である。省略しない。

判定結果:

| 状態 | 応答 |
|---|---|
| 未認証 | 401 `AUTH_REQUIRED` |
| DBにユーザーなし | 401 `AUTH_REQUIRED` |
| isActive = false | 403 `FORBIDDEN` |
| role不足 | 403 `FORBIDDEN` |

権限マトリクスは API詳細設計 §4 に従う。Phase 1 では利用箇所がないが、**関数は Phase 2 で使える完成状態にしておく**。

### 4.6 API共通基盤

#### 4.6.1 レスポンス封筒（`src/lib/api/response.ts`）

API詳細設計 §2 の形式を厳密に守る。

```ts
ok(data)                      // { data, meta }
okList(data, pagination)      // { data, pagination, meta }
fail(code, message, details?) // { error: { code, message, details?, requestId } }
```

`meta.requestId` / `error.requestId` は `REQ-` + 小文字16進8桁。

```text
REQ-9e5a4e36
```

`meta.timestamp` は ISO 8601 + `+09:00` オフセット付き。

#### 4.6.2 エラーコード（`src/lib/api/errors.ts`）

API詳細設計 §3 の**全コードを定義する**（Phase 1 で未使用のものも含む）。

コードごとに既定のHTTPステータスとユーザー向け日本語メッセージを対応付ける。

Prismaエラー変換（P2002 / P2025 / P2034 / P2024 / P2037）のマッピング関数も用意する。

**エラーレスポンスにスタックトレース・SQL・接続文字列を含めない。**

### 4.7 Health API

`GET /api/health`

```text
DB疎通あり → 200 { "status": "ok" }
DB疎通なし → 503 { "status": "unavailable" }
```

- 疎通確認は `SELECT 1` 相当の軽量クエリ
- 認証不要
- **バージョン・ホスト名・DB名・環境変数を返さない**
- レスポンス封筒（`{ data, meta }`）は使わず、上記の素の形式を返す（API詳細設計 §12 の指定）

### 4.8 画面（最小限）

#### 4.8.1 ルートレイアウト

- `lang="ja"`
- `<title>` はシステム名
- Tailwind の globals を読み込む

#### 4.8.2 `/login`（SCR-001）

画面詳細設計 §2 に従う。

- システム名
- 「Googleでログイン」ボタン
- `?error=` に応じたエラー表示
- 認証済みでアクセスしたら `/project-intakes` へリダイレクト

#### 4.8.3 `(main)/layout.tsx`

画面詳細設計 §1.2 の構成。

- ヘッダー: システム名 / ログイン中の利用者名 / ログアウト
- サイドナビ: 確認待ち案件 / 正式案件 / CSV取込履歴 / ユーザー管理（ADMINのみ表示）
- 未認証なら `/login` へリダイレクト

ナビのリンク先は Phase 2・3 で実装する。Phase 1 では `/project-intakes` 以外はリンクを置くだけでよい（404になってよい）。

#### 4.8.4 `/project-intakes`

Phase 3 までのプレースホルダ。

「この画面は Phase 3 で実装します」とだけ表示する。**ダミーデータを表示しない。**

### 4.9 Proxy（旧 middleware）

`src/proxy.ts`（§2.1.1 のとおり Next.js 16 で改称された。`middleware.ts` を作らない）

- 関数は名前付き `proxy` か default export
- 未認証で保護ページ → `/login` へリダイレクト
- 未認証で保護API → 401 JSON
- `/login`、`/api/auth/*`、`/api/health`、静的アセットは `config.matcher` で除外

next-auth v4 には v5 の `auth()` ラッパーがないため、`next-auth/jwt` の `getToken` でJWTを直接検証する。

```ts
import { getToken } from "next-auth/jwt";
import { NextResponse, type NextRequest } from "next/server";

export async function proxy(req: NextRequest) {
  const token = await getToken({ req, secret: process.env.AUTH_SECRET });
  // 未認証: ページは /login へリダイレクト、APIは401 JSON
}

export const config = { matcher: [/* 除外設定 */] };
```

`export { auth as middleware }` や `export { auth as proxy }` は **v5 の書き方なので使わない**。

### 4.10 Dockerfile

Drive-Dokploy詳細設計 §3.4 / §3.5 に従う。

マルチステージ:

```text
1. deps    : npm ci
2. builder : prisma generate + next build
3. runner  : 本番依存のみ、非rootユーザー
```

要件:

- `next.config.ts` で `output: "standalone"`
- runner は非rootユーザー（例: `nextjs` / uid 1001）で実行
- `ENV TZ=Asia/Tokyo`
- Prisma の生成物を runner へ確実にコピーする
- **`prisma.config.ts` と `prisma/` を runner へコピーする**（起動時の `migrate deploy` に必要）
- 起動コマンドで **マイグレーション適用後にアプリを起動**し、マイグレーション失敗時はアプリを起動しない

#### ビルド段階の DATABASE_URL（§2.3.5）

`prisma generate` が `prisma.config.ts` 経由で `DATABASE_URL` を要求するため、**builder段階にダミー値を置く**。実DBへは接続しない。

```dockerfile
# builder段階のみ。実行時はDokployの環境変数が使われる
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build"
```

このダミー値を runner段階へ持ち込まない。runner に残すと、Dokployの変数設定漏れに気づけなくなる。

Prisma 7 は Rust クエリエンジンのバイナリを同梱しないため、エンジンファイルの手動コピーは不要である。

```dockerfile
CMD ["sh", "-c", "npx prisma migrate deploy && node server.js"]
```

- `EXPOSE 3000`
- `.dockerignore` に `node_modules` / `.next` / `.git` / `.env*` / `docs` を入れる

**`prisma db push` を使わない。**

### 4.11 テスト基盤

Vitest を設定し、以下の最小テストを書く。

- `lib/api/response.ts`: requestId の形式、封筒の構造
- `lib/api/errors.ts`: Prismaエラー変換のマッピング
- `lib/env.ts`: 必須変数欠落時にエラーになること

Phase 1 の目的はテスト基盤が動く状態にすることであり、網羅は Phase 7 で行う。

### 4.12 README.md

以下だけを書く。冗長にしない。

- プロジェクト概要（3行程度）
- ローカル起動手順（依存インストール → `.env` 作成 → DB起動 → migrate → seed → dev）
- 主要スクリプト一覧
- 設計文書の場所（`docs/`）
- Phase 進捗（Phase 1 実装中、以降未着手）

---

## 5. 禁止事項

以下に違反した実装はレビューで差し戻す。

1. `prisma/schema.prisma` の `model` / `enum` / インデックス定義を変更する（§2.3.1 の `url` 行削除のみ許可）
2. `prisma db push` を使う
3. マイグレーションなしでDBを変更する
4. Auth.js の Prisma Adapter を導入する（スキーマ変更が発生するため）
5. Phase 2以降のAPI・画面を実装する
6. ダミーデータ・モックデータを画面に表示する
7. `.env` や秘密値をコミットする
8. `.env.example` に実値を書く（DriveフォルダIDを含む）
9. `dangerouslySetInnerHTML` を使う
10. `any` 型で型エラーを回避する
11. エラーレスポンスにスタックトレース・内部構成を含める
12. ログに `GOOGLE_PRIVATE_KEY` / `AUTH_SECRET` / `CRON_SECRET` / LINE原文を出力する
13. 設計書にない仕様を推測で実装する
14. 依存パッケージを大量に追加する（本書に記載のないライブラリを足す場合は理由を報告する）

---

## 6. 完了条件

以下を**すべて実際に実行し、結果を報告する**。「通るはず」では不可。

| # | 確認 | 期待 |
|---:|---|---|
| 1 | `npm run lint` | エラー0 |
| 2 | `npm run typecheck` | エラー0 |
| 3 | `npm run build` | 成功 |
| 4 | `npm run test` | 全件成功 |
| 5 | `docker build .` | 成功 |
| 5b | ビルドしたイメージを起動 | `migrate deploy` が通りアプリが起動する |
| 6 | クリーンDBへ `prisma migrate deploy` | 7テーブル作成 |
| 7 | 制約確認 | `database_constraints.sql` の全CHECK制約が存在 |
| 8 | `npm run db:seed` | ADMINユーザー1件作成、emailが小文字 |
| 9 | `GET /api/health` | 200 `{"status":"ok"}` |
| 10 | DB停止状態で `GET /api/health` | 503 `{"status":"unavailable"}` |
| 11 | 未登録メールでGoogleログイン | 拒否・「利用登録されていません」表示 |
| 12 | `is_active=false` のユーザーでログイン | 拒否・「無効です」表示 |
| 13 | ADMINでログイン | `/project-intakes` へ遷移、`last_login_at` 更新 |
| 14 | 未認証で `/project-intakes` | `/login` へリダイレクト |
| 15 | `git grep` で秘密値 | 検出0 |

### 6.1 テーブル数の確認

Phase 1 で作成されるテーブルは以下の7つだけ。Auth.js用テーブルが増えていたら §5-4 違反である。

```text
users
project_intakes
projects
project_sources
export_batches
csv_imports
csv_import_rows
```

---

## 7. 作業手順

```text
1. main から feature/phase1-foundation を作成
2. 本書 §4 を順に実装
3. §6 の完了条件を全項目実行
4. コミット（意味のある単位で分割。1コミットに全部入れない）
5. Pull Request を作成
```

### 7.1 Pull Request

タイトル:

```text
Phase 1: 基盤構築（Next.js / Prisma / Auth.js / Health API / Docker）
```

本文に必ず含める:

- 実装した内容の一覧
- §6 完了条件の**実行結果**（コマンド出力の要点）
- 設計書と異なる判断をした箇所とその理由（なければ「なし」）
- 未実装・積み残し
- 確認してほしい点・判断を仰ぎたい点

**main へ直接pushしない。**

---

## 8. 報告フォーマット

作業完了時、以下を報告すること。

```text
## 実装したファイル
（パス一覧）

## 完了条件の実行結果
（#1〜#15 それぞれの実結果。失敗したものは失敗と書く）

## 設計と異なる判断をした箇所
（なければ「なし」）

## 未実装・積み残し
（Phase 2以降へ送ったもの）

## 判断を仰ぎたい点
（設計書に答えがなく、推測を避けた事項）
```

失敗した項目を「成功」と報告しない。落ちたテストは落ちたと書く。
