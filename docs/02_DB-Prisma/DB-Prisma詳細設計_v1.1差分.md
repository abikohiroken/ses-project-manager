# DB・Prisma詳細設計 v1.1 差分

対象: `SES案件管理WEBアプリ_DB-Prisma詳細設計書_v1.0.md`

CSV・Google Drive取込の詳細化により、`csv_imports`へ以下の修正が必要となった。

## 1. file_hashをNULL許容・非一意へ変更

### 理由
- ファイルサイズ超過など、ダウンロード前にERRORとするファイルはSHA-256を算出できない
- 同一内容を別DriveファイルIDで再配置した場合も、SKIPPED履歴を残す必要がある
- `file_hash UNIQUE`では重複ファイルの履歴を新規作成できない

### 変更
- `file_hash`: NULL許容
- 一意制約を削除
- 通常インデックスを追加

## 2. schema_version・batch_idをNULL許容へ変更

### 理由
ファイル名が不正なCSVも`csv_imports`へERROR履歴を残すため。

## 3. duplicate_of_import_idを追加

同一内容の取込済みCSVが存在した場合:

```text
status = SKIPPED
duplicate_of_import_id = 元のcsv_imports.id
```

とする。

## 4. drive_file_idは一意のまま維持

同じDriveファイルをCronが二重処理することは、`drive_file_id UNIQUE`で防止する。

## 5. 適用ファイル
- `schema_v1.1.prisma`
- `database_constraints_v1.1.sql`

v1.1を以後の実装基準とする。
