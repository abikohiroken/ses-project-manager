-- SES案件管理WEBアプリ
-- PostgreSQL追加制約・補助インデックス
-- Prisma Migration生成後に同一migration.sqlへ追記する想定

-- users
ALTER TABLE "users"
  ADD CONSTRAINT "users_email_lowercase_ck"
  CHECK ("email" = lower("email"));

-- project_intakes
ALTER TABLE "project_intakes"
  ADD CONSTRAINT "project_intakes_unit_price_ck"
  CHECK (
    ("unit_price_min_man" IS NULL OR "unit_price_min_man" >= 0)
    AND
    ("unit_price_max_man" IS NULL OR "unit_price_max_man" >= 0)
    AND
    (
      "unit_price_min_man" IS NULL
      OR "unit_price_max_man" IS NULL
      OR "unit_price_min_man" <= "unit_price_max_man"
    )
  ),
  ADD CONSTRAINT "project_intakes_work_days_ck"
  CHECK ("work_days_per_week" IS NULL OR "work_days_per_week" BETWEEN 1 AND 7),
  ADD CONSTRAINT "project_intakes_recruitment_count_ck"
  CHECK ("recruitment_count" IS NULL OR "recruitment_count" >= 1),
  ADD CONSTRAINT "project_intakes_interview_count_ck"
  CHECK ("interview_count" IS NULL OR "interview_count" >= 0),
  ADD CONSTRAINT "project_intakes_month_range_ck"
  CHECK (
    "start_month" IS NULL
    OR "end_month" IS NULL
    OR "start_month" <= "end_month"
  ),
  ADD CONSTRAINT "project_intakes_ai_snapshot_object_ck"
  CHECK (jsonb_typeof("ai_snapshot") = 'object'),
  ADD CONSTRAINT "project_intakes_required_skills_array_ck"
  CHECK (jsonb_typeof("required_skills") = 'array'),
  ADD CONSTRAINT "project_intakes_preferred_skills_array_ck"
  CHECK (jsonb_typeof("preferred_skills") = 'array'),
  ADD CONSTRAINT "project_intakes_warning_codes_array_ck"
  CHECK (jsonb_typeof("warning_codes") = 'array'),
  ADD CONSTRAINT "project_intakes_review_state_ck"
  CHECK (
    (
      "review_status" = 'PENDING'
      AND "linked_project_id" IS NULL
      AND "reviewed_at" IS NULL
      AND "reviewed_by_id" IS NULL
    )
    OR
    (
      "review_status" IN ('REVIEWED', 'MERGED')
      AND "linked_project_id" IS NOT NULL
      AND "reviewed_at" IS NOT NULL
      AND "reviewed_by_id" IS NOT NULL
    )
    OR
    (
      "review_status" = 'REJECTED'
      AND "linked_project_id" IS NULL
      AND "reviewed_at" IS NOT NULL
      AND "reviewed_by_id" IS NOT NULL
    )
  );

-- projects
ALTER TABLE "projects"
  ADD CONSTRAINT "projects_name_not_blank_ck"
  CHECK (btrim("project_name") <> ''),
  ADD CONSTRAINT "projects_unit_price_ck"
  CHECK (
    ("unit_price_min_man" IS NULL OR "unit_price_min_man" >= 0)
    AND
    ("unit_price_max_man" IS NULL OR "unit_price_max_man" >= 0)
    AND
    (
      "unit_price_min_man" IS NULL
      OR "unit_price_max_man" IS NULL
      OR "unit_price_min_man" <= "unit_price_max_man"
    )
  ),
  ADD CONSTRAINT "projects_work_days_ck"
  CHECK ("work_days_per_week" IS NULL OR "work_days_per_week" BETWEEN 1 AND 7),
  ADD CONSTRAINT "projects_recruitment_count_ck"
  CHECK ("recruitment_count" IS NULL OR "recruitment_count" >= 1),
  ADD CONSTRAINT "projects_interview_count_ck"
  CHECK ("interview_count" IS NULL OR "interview_count" >= 0),
  ADD CONSTRAINT "projects_month_range_ck"
  CHECK (
    "start_month" IS NULL
    OR "end_month" IS NULL
    OR "start_month" <= "end_month"
  ),
  ADD CONSTRAINT "projects_required_skills_array_ck"
  CHECK (jsonb_typeof("required_skills") = 'array'),
  ADD CONSTRAINT "projects_preferred_skills_array_ck"
  CHECK (jsonb_typeof("preferred_skills") = 'array'),
  ADD CONSTRAINT "projects_archive_state_ck"
  CHECK (
    ("project_status" = 'ARCHIVED' AND "archived_at" IS NOT NULL)
    OR
    ("project_status" <> 'ARCHIVED' AND "archived_at" IS NULL)
  );

-- project_sources
ALTER TABLE "project_sources"
  ADD CONSTRAINT "project_sources_raw_text_length_ck"
  CHECK (char_length("raw_text") BETWEEN 1 AND 50000);

-- export_batches
ALTER TABLE "export_batches"
  ADD CONSTRAINT "export_batches_target_count_ck"
  CHECK ("target_count" BETWEEN 0 AND 1000),
  ADD CONSTRAINT "export_batches_generated_state_ck"
  CHECK (
    ("status" = 'CREATED' AND "generated_at" IS NOT NULL AND "drive_file_id" IS NOT NULL)
    OR
    ("status" IN ('RESERVED', 'ERROR'))
  );

-- csv_imports
ALTER TABLE "csv_imports"
  ADD CONSTRAINT "csv_imports_file_hash_ck"
  CHECK ("file_hash" IS NULL OR "file_hash" ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT "csv_imports_counts_nonnegative_ck"
  CHECK (
    "total_rows" >= 0
    AND "success_rows" >= 0
    AND "failed_rows" >= 0
    AND "skipped_rows" >= 0
    AND "attempt_count" >= 0
  ),
  ADD CONSTRAINT "csv_imports_counts_total_ck"
  CHECK (
    "success_rows" + "failed_rows" + "skipped_rows" <= "total_rows"
  ),
  ADD CONSTRAINT "csv_imports_terminal_time_ck"
  CHECK (
    ("status" IN ('SUCCESS', 'PARTIAL_SUCCESS', 'ERROR', 'SKIPPED') AND "imported_at" IS NOT NULL)
    OR
    ("status" IN ('PENDING', 'PROCESSING'))
  ),
  ADD CONSTRAINT "csv_imports_downloaded_state_ck"
  CHECK (
    "status" = 'ERROR'
    OR (
      "file_hash" IS NOT NULL
      AND "schema_version" IS NOT NULL
      AND "batch_id" IS NOT NULL
    )
  ),
  -- 設計差分v1.2 §1 適用済み。
  -- 旧定義は「SKIPPEDなら duplicate_of_import_id 必須」だったが、
  -- 全行がDB既存で行スキップされたファイル（取込設計 §17）は
  -- duplicate_of_import_id がNULLのままSKIPPEDになるため制約違反となる。
  -- 「duplicate_of_import_id を持てるのはSKIPPEDだけ」へ緩和した。
  ADD CONSTRAINT "csv_imports_duplicate_state_ck"
  CHECK (
    "duplicate_of_import_id" IS NULL
    OR "status" = 'SKIPPED'
  );

-- csv_import_rows
ALTER TABLE "csv_import_rows"
  ADD CONSTRAINT "csv_import_rows_row_number_ck"
  CHECK ("row_number" >= 1),
  ADD CONSTRAINT "csv_import_rows_success_link_ck"
  CHECK (
    ("status" = 'SUCCESS' AND "project_intake_id" IS NOT NULL)
    OR
    ("status" IN ('ERROR', 'SKIPPED'))
  );

-- 検索補助: 部分一致検索を初期版で高速化する場合のみ有効化
-- CREATE EXTENSION IF NOT EXISTS pg_trgm;
-- CREATE INDEX "projects_project_name_trgm_idx"
--   ON "projects" USING gin ("project_name" gin_trgm_ops);
-- CREATE INDEX "project_intakes_project_name_trgm_idx"
--   ON "project_intakes" USING gin ("project_name" gin_trgm_ops);
