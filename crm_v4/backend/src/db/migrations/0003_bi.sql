CREATE TYPE "public"."bi_refresh_interval" AS ENUM('manual', '15m', '1h', '6h', '24h');--> statement-breakpoint
CREATE TYPE "public"."bi_share_permission" AS ENUM('edit', 'view');--> statement-breakpoint
CREATE TYPE "public"."bi_snapshot_status" AS ENUM('running', 'succeeded', 'failed');--> statement-breakpoint
CREATE TYPE "public"."bi_source_kind" AS ENUM('spreadsheet_file', 'spreadsheet_url', 'postgres', 'mysql', 'api');--> statement-breakpoint
CREATE TABLE "bi_relationships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"left_source_id" text NOT NULL,
	"left_field" text NOT NULL,
	"right_source_id" text NOT NULL,
	"right_field" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bi_relationships_distinct_sources_check" CHECK ("bi_relationships"."left_source_id" <> "bi_relationships"."right_source_id")
);
--> statement-breakpoint
CREATE TABLE "bi_snapshot_rows" (
	"snapshot_id" uuid NOT NULL,
	"row_num" integer NOT NULL,
	"data" jsonb NOT NULL,
	CONSTRAINT "bi_snapshot_rows_snapshot_id_row_num_pk" PRIMARY KEY("snapshot_id","row_num")
);
--> statement-breakpoint
CREATE TABLE "bi_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" uuid NOT NULL,
	"status" "bi_snapshot_status" DEFAULT 'running' NOT NULL,
	"row_count" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"error" text,
	CONSTRAINT "bi_snapshots_row_count_check" CHECK ("bi_snapshots"."row_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "bi_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" "citext" NOT NULL,
	"kind" "bi_source_kind" NOT NULL,
	"config" jsonb NOT NULL,
	"secrets_encrypted" text,
	"fields" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"refresh_interval" "bi_refresh_interval" DEFAULT 'manual' NOT NULL,
	"next_refresh_at" timestamp with time zone,
	"current_snapshot_id" uuid,
	"last_attempt_at" timestamp with time zone,
	"last_error" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bi_sources_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "report_shares" (
	"report_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"permission" "bi_share_permission" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "report_shares_report_id_user_id_pk" PRIMARY KEY("report_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"owner_id" uuid NOT NULL,
	"definition" jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reports_name_length_check" CHECK (char_length("reports"."name") BETWEEN 1 AND 100)
);
--> statement-breakpoint
ALTER TABLE "bi_snapshot_rows" ADD CONSTRAINT "bi_snapshot_rows_snapshot_id_bi_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."bi_snapshots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bi_snapshots" ADD CONSTRAINT "bi_snapshots_source_id_bi_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."bi_sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bi_sources" ADD CONSTRAINT "bi_sources_current_snapshot_id_bi_snapshots_id_fk" FOREIGN KEY ("current_snapshot_id") REFERENCES "public"."bi_snapshots"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bi_sources" ADD CONSTRAINT "bi_sources_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_shares" ADD CONSTRAINT "report_shares_report_id_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."reports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_shares" ADD CONSTRAINT "report_shares_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "bi_relationships_pair_idx" ON "bi_relationships" USING btree (least("left_source_id" || '/' || "left_field", "right_source_id" || '/' || "right_field"),greatest("left_source_id" || '/' || "left_field", "right_source_id" || '/' || "right_field"));--> statement-breakpoint
CREATE UNIQUE INDEX "bi_snapshots_one_running_idx" ON "bi_snapshots" USING btree ("source_id") WHERE "bi_snapshots"."status" = 'running';--> statement-breakpoint
CREATE INDEX "bi_sources_next_refresh_idx" ON "bi_sources" USING btree ("next_refresh_at") WHERE "bi_sources"."next_refresh_at" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "report_shares_user_idx" ON "report_shares" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "reports_owner_idx" ON "reports" USING btree ("owner_id");--> statement-breakpoint
ALTER TABLE "bi_sources" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "bi_snapshots" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "bi_snapshot_rows" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "bi_relationships" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "reports" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "report_shares" ENABLE ROW LEVEL SECURITY;
