CREATE TYPE "public"."stage_color" AS ENUM('gray', 'red', 'orange', 'amber', 'green', 'teal', 'blue', 'violet');--> statement-breakpoint
CREATE TYPE "public"."stage_kind" AS ENUM('open', 'won', 'lost');--> statement-breakpoint
CREATE TABLE "lead_stage_changes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid NOT NULL,
	"from_stage_id" uuid,
	"to_stage_id" uuid,
	"from_stage_name" text,
	"to_stage_name" text,
	"changed_by_id" uuid,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pipeline_id" uuid NOT NULL,
	"stage_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"title" text,
	"value_cents" bigint,
	"assignee_id" uuid,
	"notes" text,
	"lost_reason" text,
	"position" double precision NOT NULL,
	"stage_entered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "leads_pipeline_contact_unique" UNIQUE("pipeline_id","contact_id"),
	CONSTRAINT "leads_value_cents_check" CHECK ("leads"."value_cents" >= 0)
);
--> statement-breakpoint
CREATE TABLE "pipeline_stages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pipeline_id" uuid NOT NULL,
	"name" text NOT NULL,
	"color" "stage_color" DEFAULT 'gray' NOT NULL,
	"kind" "stage_kind" DEFAULT 'open' NOT NULL,
	"position" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pipelines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"is_entry" boolean DEFAULT false NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "lead_stage_changes" ADD CONSTRAINT "lead_stage_changes_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_stage_changes" ADD CONSTRAINT "lead_stage_changes_from_stage_id_pipeline_stages_id_fk" FOREIGN KEY ("from_stage_id") REFERENCES "public"."pipeline_stages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_stage_changes" ADD CONSTRAINT "lead_stage_changes_to_stage_id_pipeline_stages_id_fk" FOREIGN KEY ("to_stage_id") REFERENCES "public"."pipeline_stages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_stage_changes" ADD CONSTRAINT "lead_stage_changes_changed_by_id_users_id_fk" FOREIGN KEY ("changed_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_pipeline_id_pipelines_id_fk" FOREIGN KEY ("pipeline_id") REFERENCES "public"."pipelines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_stage_id_pipeline_stages_id_fk" FOREIGN KEY ("stage_id") REFERENCES "public"."pipeline_stages"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_assignee_id_users_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pipeline_stages" ADD CONSTRAINT "pipeline_stages_pipeline_id_pipelines_id_fk" FOREIGN KEY ("pipeline_id") REFERENCES "public"."pipelines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lead_stage_changes_lead_idx" ON "lead_stage_changes" USING btree ("lead_id","changed_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "leads_stage_position_idx" ON "leads" USING btree ("stage_id","position","id");--> statement-breakpoint
CREATE INDEX "leads_contact_idx" ON "leads" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "leads_assignee_idx" ON "leads" USING btree ("assignee_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pipeline_stages_name_idx" ON "pipeline_stages" USING btree ("pipeline_id",lower("name"));--> statement-breakpoint
CREATE INDEX "pipeline_stages_position_idx" ON "pipeline_stages" USING btree ("pipeline_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "pipelines_active_name_idx" ON "pipelines" USING btree (lower("name")) WHERE "pipelines"."archived_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "pipelines_single_entry_idx" ON "pipelines" USING btree ("is_entry") WHERE "pipelines"."is_entry" AND "pipelines"."archived_at" IS NULL;--> statement-breakpoint
ALTER TABLE "pipelines" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "pipeline_stages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "leads" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "lead_stage_changes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
WITH vendas AS (
	INSERT INTO "pipelines" ("name", "is_entry") VALUES ('Vendas', true) RETURNING "id"
)
INSERT INTO "pipeline_stages" ("pipeline_id", "name", "color", "kind", "position")
SELECT vendas."id", stage.name, stage.color::"stage_color", stage.kind::"stage_kind", stage.position
FROM vendas, (VALUES
	('Novo', 'gray', 'open', 0),
	('Em contato', 'blue', 'open', 1),
	('Proposta', 'amber', 'open', 2),
	('Ganho', 'green', 'won', 3),
	('Perdido', 'red', 'lost', 4)
) AS stage(name, color, kind, position);
