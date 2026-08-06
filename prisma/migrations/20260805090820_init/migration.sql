-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'OPERATOR', 'VIEWER');

-- CreateEnum
CREATE TYPE "IntakeReviewStatus" AS ENUM ('PENDING', 'REVIEWED', 'MERGED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('OPEN', 'ON_HOLD', 'CLOSED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ExportBatchStatus" AS ENUM ('RESERVED', 'CREATED', 'ERROR');

-- CreateEnum
CREATE TYPE "CsvImportStatus" AS ENUM ('PENDING', 'PROCESSING', 'SUCCESS', 'PARTIAL_SUCCESS', 'ERROR', 'SKIPPED');

-- CreateEnum
CREATE TYPE "DriveMoveStatus" AS ENUM ('PENDING', 'MOVED', 'MOVE_PENDING', 'ERROR');

-- CreateEnum
CREATE TYPE "CsvImportRowStatus" AS ENUM ('SUCCESS', 'ERROR', 'SKIPPED');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'OPERATOR',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_login_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_intakes" (
    "id" UUID NOT NULL,
    "reception_id" VARCHAR(64) NOT NULL,
    "line_message_id" VARCHAR(128) NOT NULL,
    "ai_snapshot" JSONB NOT NULL,
    "project_name" VARCHAR(255),
    "project_summary" TEXT,
    "required_skills" JSONB NOT NULL DEFAULT '[]',
    "preferred_skills" JSONB NOT NULL DEFAULT '[]',
    "role" VARCHAR(100),
    "process" VARCHAR(255),
    "unit_price_min_man" INTEGER,
    "unit_price_max_man" INTEGER,
    "settlement_range" VARCHAR(100),
    "start_month" DATE,
    "end_month" DATE,
    "work_days_per_week" INTEGER,
    "location" VARCHAR(255),
    "nearest_station" VARCHAR(255),
    "remote_style" VARCHAR(32),
    "remote_note" TEXT,
    "recruitment_count" INTEGER,
    "commercial_flow" TEXT,
    "interview_count" INTEGER,
    "foreigner_allowed" VARCHAR(32),
    "age_limit" VARCHAR(100),
    "nationality_note" TEXT,
    "employment_condition" TEXT,
    "warning_codes" JSONB NOT NULL DEFAULT '[]',
    "review_status" "IntakeReviewStatus" NOT NULL DEFAULT 'PENDING',
    "linked_project_id" UUID,
    "prompt_version" VARCHAR(64) NOT NULL,
    "received_at" TIMESTAMPTZ(3) NOT NULL,
    "reviewed_at" TIMESTAMPTZ(3),
    "reviewed_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "project_intakes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" UUID NOT NULL,
    "project_code" VARCHAR(32) NOT NULL,
    "project_name" VARCHAR(255) NOT NULL,
    "project_summary" TEXT,
    "required_skills" JSONB NOT NULL DEFAULT '[]',
    "preferred_skills" JSONB NOT NULL DEFAULT '[]',
    "role" VARCHAR(100),
    "process" VARCHAR(255),
    "project_status" "ProjectStatus" NOT NULL DEFAULT 'OPEN',
    "unit_price_min_man" INTEGER,
    "unit_price_max_man" INTEGER,
    "settlement_range" VARCHAR(100),
    "start_month" DATE,
    "end_month" DATE,
    "work_days_per_week" INTEGER,
    "location" VARCHAR(255),
    "nearest_station" VARCHAR(255),
    "remote_style" VARCHAR(32),
    "remote_note" TEXT,
    "recruitment_count" INTEGER,
    "commercial_flow" TEXT,
    "interview_count" INTEGER,
    "foreigner_allowed" VARCHAR(32),
    "age_limit" VARCHAR(100),
    "nationality_note" TEXT,
    "employment_condition" TEXT,
    "created_by_id" UUID NOT NULL,
    "updated_by_id" UUID,
    "archived_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_sources" (
    "id" UUID NOT NULL,
    "project_intake_id" UUID NOT NULL,
    "project_id" UUID,
    "reception_id" VARCHAR(64) NOT NULL,
    "line_message_id" VARCHAR(128) NOT NULL,
    "line_user_id" VARCHAR(128),
    "line_group_id" VARCHAR(128),
    "source_company" VARCHAR(255),
    "source_contact" VARCHAR(100),
    "raw_text" TEXT NOT NULL,
    "received_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "export_batches" (
    "id" UUID NOT NULL,
    "batch_id" VARCHAR(64) NOT NULL,
    "schema_version" VARCHAR(32) NOT NULL,
    "prompt_version" VARCHAR(64) NOT NULL,
    "file_name" VARCHAR(255) NOT NULL,
    "drive_file_id" VARCHAR(255),
    "target_count" INTEGER NOT NULL,
    "status" "ExportBatchStatus" NOT NULL DEFAULT 'RESERVED',
    "generated_at" TIMESTAMPTZ(3),
    "error_message" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "export_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "csv_imports" (
    "id" UUID NOT NULL,
    "export_batch_id" UUID,
    "drive_file_id" VARCHAR(255) NOT NULL,
    "file_hash" CHAR(64),
    "file_name" VARCHAR(255) NOT NULL,
    "schema_version" VARCHAR(32),
    "batch_id" VARCHAR(64),
    "duplicate_of_import_id" UUID,
    "status" "CsvImportStatus" NOT NULL DEFAULT 'PENDING',
    "drive_move_status" "DriveMoveStatus" NOT NULL DEFAULT 'PENDING',
    "total_rows" INTEGER NOT NULL DEFAULT 0,
    "success_rows" INTEGER NOT NULL DEFAULT 0,
    "failed_rows" INTEGER NOT NULL DEFAULT 0,
    "skipped_rows" INTEGER NOT NULL DEFAULT 0,
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "processing_started_at" TIMESTAMPTZ(3),
    "imported_at" TIMESTAMPTZ(3),
    "error_code" VARCHAR(64),
    "error_message" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "csv_imports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "csv_import_rows" (
    "id" UUID NOT NULL,
    "csv_import_id" UUID NOT NULL,
    "row_number" INTEGER NOT NULL,
    "reception_id" VARCHAR(64),
    "line_message_id" VARCHAR(128),
    "status" "CsvImportRowStatus" NOT NULL,
    "error_code" VARCHAR(64),
    "error_message" TEXT,
    "project_intake_id" UUID,
    "raw_data" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "csv_import_rows_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_role_active_idx" ON "users"("role", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "project_intakes_reception_id_key" ON "project_intakes"("reception_id");

-- CreateIndex
CREATE UNIQUE INDEX "project_intakes_line_message_id_key" ON "project_intakes"("line_message_id");

-- CreateIndex
CREATE INDEX "project_intakes_status_received_idx" ON "project_intakes"("review_status", "received_at" DESC);

-- CreateIndex
CREATE INDEX "project_intakes_project_name_idx" ON "project_intakes"("project_name");

-- CreateIndex
CREATE INDEX "project_intakes_start_month_idx" ON "project_intakes"("start_month");

-- CreateIndex
CREATE INDEX "project_intakes_linked_project_idx" ON "project_intakes"("linked_project_id");

-- CreateIndex
CREATE UNIQUE INDEX "projects_project_code_key" ON "projects"("project_code");

-- CreateIndex
CREATE INDEX "projects_status_updated_idx" ON "projects"("project_status", "updated_at" DESC);

-- CreateIndex
CREATE INDEX "projects_project_name_idx" ON "projects"("project_name");

-- CreateIndex
CREATE INDEX "projects_start_month_idx" ON "projects"("start_month");

-- CreateIndex
CREATE INDEX "projects_location_idx" ON "projects"("location");

-- CreateIndex
CREATE UNIQUE INDEX "project_sources_project_intake_id_key" ON "project_sources"("project_intake_id");

-- CreateIndex
CREATE UNIQUE INDEX "project_sources_reception_id_key" ON "project_sources"("reception_id");

-- CreateIndex
CREATE UNIQUE INDEX "project_sources_line_message_id_key" ON "project_sources"("line_message_id");

-- CreateIndex
CREATE INDEX "project_sources_project_idx" ON "project_sources"("project_id");

-- CreateIndex
CREATE INDEX "project_sources_company_idx" ON "project_sources"("source_company");

-- CreateIndex
CREATE INDEX "project_sources_received_idx" ON "project_sources"("received_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "export_batches_batch_id_key" ON "export_batches"("batch_id");

-- CreateIndex
CREATE UNIQUE INDEX "export_batches_file_name_key" ON "export_batches"("file_name");

-- CreateIndex
CREATE UNIQUE INDEX "export_batches_drive_file_id_key" ON "export_batches"("drive_file_id");

-- CreateIndex
CREATE INDEX "export_batches_status_created_idx" ON "export_batches"("status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "csv_imports_export_batch_id_key" ON "csv_imports"("export_batch_id");

-- CreateIndex
CREATE UNIQUE INDEX "csv_imports_drive_file_id_key" ON "csv_imports"("drive_file_id");

-- CreateIndex
CREATE INDEX "csv_imports_file_hash_idx" ON "csv_imports"("file_hash");

-- CreateIndex
CREATE INDEX "csv_imports_duplicate_of_idx" ON "csv_imports"("duplicate_of_import_id");

-- CreateIndex
CREATE INDEX "csv_imports_status_started_idx" ON "csv_imports"("status", "processing_started_at");

-- CreateIndex
CREATE INDEX "csv_imports_move_status_idx" ON "csv_imports"("drive_move_status", "updated_at");

-- CreateIndex
CREATE INDEX "csv_imports_batch_idx" ON "csv_imports"("batch_id");

-- CreateIndex
CREATE UNIQUE INDEX "csv_import_rows_project_intake_id_key" ON "csv_import_rows"("project_intake_id");

-- CreateIndex
CREATE INDEX "csv_import_rows_import_status_idx" ON "csv_import_rows"("csv_import_id", "status");

-- CreateIndex
CREATE INDEX "csv_import_rows_reception_idx" ON "csv_import_rows"("reception_id");

-- CreateIndex
CREATE UNIQUE INDEX "csv_import_rows_import_row_uq" ON "csv_import_rows"("csv_import_id", "row_number");

-- AddForeignKey
ALTER TABLE "project_intakes" ADD CONSTRAINT "project_intakes_linked_project_id_fkey" FOREIGN KEY ("linked_project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_intakes" ADD CONSTRAINT "project_intakes_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_sources" ADD CONSTRAINT "project_sources_project_intake_id_fkey" FOREIGN KEY ("project_intake_id") REFERENCES "project_intakes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_sources" ADD CONSTRAINT "project_sources_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "csv_imports" ADD CONSTRAINT "csv_imports_export_batch_id_fkey" FOREIGN KEY ("export_batch_id") REFERENCES "export_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "csv_imports" ADD CONSTRAINT "csv_imports_duplicate_of_import_id_fkey" FOREIGN KEY ("duplicate_of_import_id") REFERENCES "csv_imports"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "csv_import_rows" ADD CONSTRAINT "csv_import_rows_csv_import_id_fkey" FOREIGN KEY ("csv_import_id") REFERENCES "csv_imports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "csv_import_rows" ADD CONSTRAINT "csv_import_rows_project_intake_id_fkey" FOREIGN KEY ("project_intake_id") REFERENCES "project_intakes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

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
