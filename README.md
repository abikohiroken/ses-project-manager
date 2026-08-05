# SES案件管理WEBアプリ

LINE公式アカウントで受信したSES案件情報を、Googleスプレッドシート・ChatGPT・Google Apps Script・Google Drive を経由して構造化し、人間が原文と突き合わせて確認したうえで正式案件として登録する社内システム。

現在は**設計完了・実装未着手**の状態。

## 全体フロー

```text
LINE公式アカウント
  → Next.js /api/webhooks/line（署名検証）
  → Googleスプレッドシート raw_inbox
  → ChatGPTスケジュール機能（構造化）
  → structured_projects
  → Google Apps Script（30分ごとにCSV生成）
  → Google Drive inbox
  → 本アプリが30分ごとに取込
  → project_intakes（確認待ち）
  → 人間が原文と比較・修正
  → projects（正式案件）
```

## 設計文書

`docs/` 配下。**実装前に必ず `docs/09_実装指示/` を読むこと。**

| 場所 | 内容 |
|---|---|
| `docs/09_実装指示/設計差分_v1.2_実装前確定事項.md` | 実装前レビューで確定した矛盾解消・欠落補完。**最優先** |
| `docs/09_実装指示/Phase1_実装指示書.md` | Phase 1 の実装範囲・完了条件 |
| `docs/00_引き継ぎ/` | 引き継ぎ書 |
| `docs/01_基本設計/` | 基本設計 v2.4 + v2.5差分 |
| `docs/02_DB-Prisma/` | DB設計 v1.1 / `schema.prisma` / 制約SQL |
| `docs/03_CSV-Drive取込/` | CSV仕様（33列）・Drive取込処理 |
| `docs/04_API/` | API詳細設計 / OpenAPI |
| `docs/05_画面/` | 画面詳細設計 |
| `docs/06_LINE-Sheets-GAS/` | LINE Webhook / スプレッドシート / GAS |
| `docs/07_Drive-Dokploy/` | Drive構成 / Dokploy配備 |
| `docs/08_テスト-運用/` | テスト観点 / 運用・バックアップ |

文書の優先順位は `docs/09_実装指示/Phase1_実装指示書.md` §0.2 を参照。基本設計 v2.4 は最古のため単独で根拠にしない。

## 技術スタック

Next.js (App Router) / TypeScript / Tailwind CSS / Prisma / PostgreSQL / Auth.js (Google OAuth) / Dokploy

## 実装フェーズ

| Phase | 内容 | 状態 |
|---|---|---|
| 1 | 基盤（Next.js / Prisma / Auth.js / Health / Docker） | 未着手 |
| 2 | API（intakes / projects / csv-imports / users） | 未着手 |
| 3 | 画面（SCR-001〜007） | 未着手 |
| 4 | CSV・Google Drive自動取込 | 未着手 |
| 5 | LINE Webhook / Google Sheets連携 | 未着手 |
| 6 | ChatGPTスケジュール / GAS CSV生成 | 未着手 |
| 7 | テスト・本番配備 | 未着手 |

## セットアップ

Phase 1 実装後に記載する。

## 注意

- 秘密鍵・APIキー・`.env` をこのリポジトリへコミットしない
- 本番で `prisma db push` を使わない。変更は必ずマイグレーションで行う
- LINE原文（`project_sources.raw_text`）は不変。編集可能にしない
