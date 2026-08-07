# Phase 6 GAS 手動テスト手順書

## 1. 目的と前提

Vitestでは確認できないSpreadsheet、Drive、Lock、権限、トリガーの挙動を実環境で確認する。実施前に対象スプレッドシートとDriveフォルダのバックアップを取得し、テスト専用データを使用する。

前提設定:

- Apps Scriptへ`gas/`の7ファイルを配置済み
- プロジェクトのタイムゾーンは`Asia/Tokyo`
- settingsの`CSV_SCHEMA_VERSION=v1`
- settingsの`CSV_INBOX_FOLDER_ID`を設定済み
- settingsの`MAX_CSV_ROWS=1000`
- 同一ルート直下に`inbox` / `processed` / `error`が存在

各項目で、実施日、実施者、入力データ、生成ファイルID、batch_id、結果、備考を記録する。

## 2. GAS単体手動テスト

### 2.1 対象0件

1. `structured_projects`に`export_status=WAITING`の行がない状態にする。
2. `exportWaitingProjectsToCsv`を実行する。
3. Driveと`export_batches`を確認する。

期待: エラーなく終了し、CSV・export_batches行を作成しない。

### 2.2 対象1件

1. 正常な37列の行を1件、`export_status=WAITING`で用意する。
2. 関数を実行する。

期待: inboxへCSVが1本作成され、対象はEXPORTED、export_batchesはCREATEDになる。

### 2.3 対象1,000件

1. 同じprompt_versionの小さい行を1,000件用意する。
2. 関数を実行する。

期待: 1,000データ行を含むCSVが1本だけ作成される。

### 2.4 対象1,001件

1. 同じprompt_versionの小さい行を1,001件用意する。
2. 関数を実行する。

期待: 1,000件と1件の2本へ分割される。

### 2.5 UTF-8で9MiB超相当

1. `raw_text`へ日本語を多く含む行を複数用意し、合計CSVが9MiBを超える状態にする。
2. 関数を実行する。
3. 各ファイルをダウンロードし、バイト単位のサイズを確認する。

期待: 9MiBを超える前に分割され、各CSVが9MiB以下になる。文字数ではなくUTF-8バイト数で判定される。

### 2.6 prompt_version混在

1. `PROJECT-PARSER-1`と別の検証用prompt_versionのWAITING行を用意する。
2. 関数を実行する。

期待: prompt_versionごとに別CSVとなり、1ファイル内で混在しない。

### 2.7 同時実行

1. 同じ関数を実行する時間主導トリガーを近接時刻に2つ設定する。
2. 十分なWAITING行を用意して実行時間を確保する。
3. Apps Scriptの実行履歴と生成CSVを確認する。

期待: Script Lockにより同時処理されず、同じ行からCSVが重複生成されない。

### 2.8 Drive作成失敗

1. テスト用にアクセスできないフォルダIDを設定する、またはテスト実行者のDrive作成権限を外す。
2. WAITING行を1件用意して実行する。
3. 設定と権限を元へ戻す。

期待: 対象行がWAITINGへ戻り、batch_idが空欄となり、structure_errorへ短い説明が入る。export_batchesはERRORになる。

### 2.9 CSV保存後のシート更新失敗

1. Drive作成までは成功し、その後のシート更新が失敗する検証条件をテスト環境で作る。
2. 1回目を実行し、CSVが存在して対象またはexport_batchesがRESERVEDで残ることを確認する。
3. シート更新可能な状態へ戻して再実行する。

期待: 同じbatch_idのCSVを再作成せず、既存DriveファイルIDを使って対象をEXPORTED、export_batchesをCREATEDへ修復する。

### 2.10 同一batch_idのファイルが既に存在

1. RESERVEDのexport_batches行と同じbatch_idを持つCSVをinbox、processed、errorのいずれかへ用意する。
2. 対応するstructured_projects行を同じbatch_idのRESERVEDにする。
3. 関数を実行する。

期待: 新しいCSVを作成せず、既存ファイルIDを使ってシート状態だけを修復する。3フォルダそれぞれで実施する。

### 2.11 特殊文字を含む原文

1. raw_textへセル内改行、カンマ、`"引用符"`、先頭・末尾空白を含む行を用意する。
2. 関数を実行してCSVをダウンロードする。
3. CSVパーサーまたはPhase 4取込で値を確認する。

期待: 全セルがquoteされ、引用符だけがCSV規則で二重化される。raw_textの空白と改行は復元後に元と完全一致する。

### 2.12 シート並び替え後の更新

1. WAITING行を複数用意する。
2. 予約後から状態更新までの検証タイミングでシートを並び替える。
3. 処理結果をreception_idとline_message_idで照合する。

期待: 行番号ではなく識別子で再検索され、別案件を誤更新しない。

## 3. Phase 4との結合確認

1. GASでCSVを生成し、Driveのinboxへ保存する。
2. 生成ファイル名が`ses_projects_v1_BATCH-YYYYMMDD-HHMMSS-XXXXXX.csv`形式であることを確認する。
3. CSVがUTF-8 BOM、33列ヘッダー、全セルquote、CRLFであることを確認する。
4. Bearer `CRON_SECRET`付きで`POST /api/internal/google-drive-import`を実行する。
5. `csv_imports.status`がSUCCESSになることを確認する。
6. `project_intakes`へ対象行が登録されることを確認する。
7. CSVがDriveのprocessedへ移動することを確認する。
8. `structured_projects.batch_id`と`export_batches.batch_id`が取込結果と一致することを確認する。

期待: GAS生成CSVをPhase 4が変更なしで取り込み、案件登録とprocessed移動まで完了する。

## 4. トリガー確認

1. `exportWaitingProjectsToCsv`へ時間主導型トリガーを作成する。
2. 間隔を30分ごとに設定する。
3. 実行アカウントがスプレッドシート所有者であることを確認する。
4. プロジェクトのタイムゾーンが`Asia/Tokyo`であることを再確認する。
5. 実行履歴に秘密値やraw_text全文が出力されないことを確認する。
