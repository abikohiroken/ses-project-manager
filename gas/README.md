# Phase 6 GAS 導入手順

このディレクトリは、ChatGPTが `structured_projects` へ作成した行をCSVへ変換し、Google Driveの `inbox` へ保存するGoogle Apps Scriptです。LINE Webhookは受信しません。

## 前提

- スプレッドシート名: `SES案件取込管理`
- シート: `structured_projects` / `export_batches` / `settings`
- Drive構成: 同じルート直下に `inbox` / `processed` / `error`
- Apps Scriptのタイムゾーン: `Asia/Tokyo`
- 実行アカウント: スプレッドシート所有者

## 配置

スプレッドシートから「拡張機能」→「Apps Script」を開き、`gas/` 配下の次のファイルを同名で作成して内容を貼り付けます。

1. `CsvWriter.gs`
2. `BatchService.gs`
3. `Config.gs`
4. `SheetService.gs`
5. `DriveService.gs`
6. `ErrorService.gs`
7. `Code.gs`

純粋ファイルの `CsvWriter.gs` と `BatchService.gs` にGAS固有APIを追加しないでください。

## settings

`settings` シートのH列をキー、I列を値として、次を設定します。秘密値は置きません。

| キー                  | 値                     |
| --------------------- | ---------------------- |
| `CSV_SCHEMA_VERSION`  | `v1`                   |
| `CSV_INBOX_FOLDER_ID` | DriveのinboxフォルダID |
| `MAX_CSV_ROWS`        | `1000`                 |

`inbox` と同じ親フォルダに、`processed` と `error` がそれぞれ1つ存在する必要があります。

## 初回確認

1. Apps Scriptのプロジェクト設定でタイムゾーンを `Asia/Tokyo` にする。
2. `exportWaitingProjectsToCsv` を手動実行し、Spreadsheet/Drive権限を承認する。
3. `docs/11_手動テスト/GAS手動テスト手順書.md` に従って確認する。
4. 問題がなければ、時間主導型・30分ごとのトリガーを `exportWaitingProjectsToCsv` に設定する。

## 冪等性

CSV保存後にシート更新だけ失敗した場合、対象は `RESERVED` のまま残ります。次回実行は同じ `batch_id` のファイルを `inbox` / `processed` / `error` から検索し、新しいCSVを作らずシート状態だけを修復します。Drive作成前の失敗は対象行を `WAITING` へ戻します。
