# SES案件管理WEBアプリ 最新設計一式

作成日時: 2026-08-05 15:45:19 +0900

## 実装基準

本パッケージは、以下を最新の実装基準とします。

1. 基本設計 v2.4 確定版
2. 基本設計 v2.5差分（LINE受信経路修正）
3. DB・Prisma詳細設計 v1.0 + v1.1差分
4. `schema.prisma` / `database_constraints.sql` はv1.1反映済み
5. CSV・Google Drive取込詳細設計 v1.0
6. API・画面・LINE/GAS・Dokploy・テスト運用詳細設計 v1.0

## 重要事項

LINE受信経路は次を正式構成とします。

```text
LINE
  → Next.js Webhookで署名検証
  → Google Sheets API
  → raw_inbox
```

Google Apps ScriptはLINE Webhookを直接受信せず、CSV生成を担当します。

## フォルダ構成

```text
01_基本設計/
02_DB-Prisma/
03_CSV-Drive取込/
04_API/
05_画面/
06_LINE-Sheets-GAS/
07_Drive-Dokploy/
08_テスト-運用/
```

## 実装時の参照順

1. `01_基本設計`
2. `02_DB-Prisma`
3. `03_CSV-Drive取込`
4. `04_API`
5. `05_画面`
6. `06_LINE-Sheets-GAS`
7. `07_Drive-Dokploy`
8. `08_テスト-運用`

## 除外した旧版

v2.3以前の基本設計、Prisma v1.0の実装ファイル、旧制約SQLなどは含めていません。
