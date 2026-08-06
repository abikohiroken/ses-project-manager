# SES案件管理WEBアプリ

LINEで受信したSES案件情報を構造化し、人間の確認後に正式案件として登録する社内システムです。
Next.js、PostgreSQL、Prisma、Google OAuthで構築します。
設計文書は [`docs/`](docs/) にあります。

## ローカル起動

1. `npm install`
2. `.env.example` を `.env` にコピーしてローカル値を設定
3. PostgreSQL 16を起動
4. `npm run db:migrate`
5. `npm run db:seed`
6. `npm run dev`

## 主要スクリプト

- `npm run dev`: 開発サーバー
- `npm run build`: Prisma Client生成と本番ビルド
- `npm run lint`: ESLint
- `npm run typecheck`: TypeScript型検査
- `npm run test`: Unitテスト
- `npm run db:migrate`: 開発Migration
- `npm run db:deploy`: Migration適用
- `npm run db:seed`: 初期ADMIN登録

## Phase進捗

- Phase 1: 実装中
- Phase 2以降: 未着手
