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

- Phase 1（基盤: Next.js / Prisma / next-auth / Health API / Docker）: **完了**（PR #1）
- Phase 2（API群: project-intakes / projects / csv-imports / integration-status / users）: **完了**（PR #2）
- Phase 3（画面: SCR-001〜007）: **完了**（PR #3）
- Phase 4（CSV・Google Drive自動取込）: 着手可能
- Phase 5以降（LINE連携・GAS・テスト/配備）: 未着手

実装指示は `docs/09_実装指示/` を参照。着手前に `設計差分_v1.2_実装前確定事項.md` を必ず読むこと。
