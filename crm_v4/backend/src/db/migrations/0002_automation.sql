CREATE TYPE "public"."ai_test_status" AS ENUM('ok', 'failed');--> statement-breakpoint
CREATE TYPE "public"."ai_vendor" AS ENUM('openai', 'anthropic', 'gemini');--> statement-breakpoint
CREATE TYPE "public"."flow_status" AS ENUM('draft', 'active', 'inactive');--> statement-breakpoint
CREATE TYPE "public"."flow_trigger_type" AS ENUM('message_received', 'manual');--> statement-breakpoint
CREATE TYPE "public"."handling_mode" AS ENUM('automation', 'human');--> statement-breakpoint
CREATE TYPE "public"."run_origin" AS ENUM('message_received', 'manual', 'test');--> statement-breakpoint
CREATE TYPE "public"."run_status" AS ENUM('running', 'waiting', 'completed', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."step_status" AS ENUM('ok', 'failed');--> statement-breakpoint
CREATE TABLE "ai_agents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"provider_id" uuid NOT NULL,
	"model" text NOT NULL,
	"instructions" text NOT NULL,
	"history_size" integer DEFAULT 20 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_agents_name_unique" UNIQUE("name"),
	CONSTRAINT "ai_agents_history_size_check" CHECK ("ai_agents"."history_size" BETWEEN 5 AND 50)
);
--> statement-breakpoint
CREATE TABLE "ai_providers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"vendor" "ai_vendor" NOT NULL,
	"key_ciphertext" "bytea" NOT NULL,
	"key_iv" "bytea" NOT NULL,
	"key_auth_tag" "bytea" NOT NULL,
	"key_hint" text NOT NULL,
	"available_models" text[] DEFAULT '{}'::text[] NOT NULL,
	"last_test_status" "ai_test_status" NOT NULL,
	"last_tested_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_providers_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "flow_run_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"node_id" text NOT NULL,
	"node_type" text NOT NULL,
	"status" "step_status" NOT NULL,
	"input" jsonb,
	"output" jsonb,
	"error" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "flow_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"flow_id" uuid NOT NULL,
	"version_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"origin" "run_origin" NOT NULL,
	"status" "run_status" NOT NULL,
	"current_node_id" text,
	"state" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"resume_at" timestamp with time zone,
	"lease_until" timestamp with time zone,
	"steps_count" integer DEFAULT 0 NOT NULL,
	"started_by_user_id" uuid,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"end_reason" text,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "flow_runs_steps_count_check" CHECK ("flow_runs"."steps_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "flow_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"flow_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"graph" jsonb NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "flow_versions_flow_number_unique" UNIQUE("flow_id","number")
);
--> statement-breakpoint
CREATE TABLE "flows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"status" "flow_status" DEFAULT 'draft' NOT NULL,
	"trigger_type" "flow_trigger_type",
	"priority" integer DEFAULT 100 NOT NULL,
	"current_version_id" uuid,
	"activated_at" timestamp with time zone,
	"created_by_user_id" uuid,
	"updated_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "flows_name_unique" UNIQUE("name")
);
--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "automation_opt_out_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "automation_opt_out_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "handling_mode" "handling_mode" DEFAULT 'automation' NOT NULL;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "handoff_reason" text;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "handoff_summary" text;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "handoff_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "assumed_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "flow_run_id" uuid;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "ai_agent_id" uuid;--> statement-breakpoint
ALTER TABLE "ai_agents" ADD CONSTRAINT "ai_agents_provider_id_ai_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."ai_providers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_agents" ADD CONSTRAINT "ai_agents_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flow_run_steps" ADD CONSTRAINT "flow_run_steps_run_id_flow_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."flow_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flow_runs" ADD CONSTRAINT "flow_runs_flow_id_flows_id_fk" FOREIGN KEY ("flow_id") REFERENCES "public"."flows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flow_runs" ADD CONSTRAINT "flow_runs_version_id_flow_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."flow_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flow_runs" ADD CONSTRAINT "flow_runs_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flow_runs" ADD CONSTRAINT "flow_runs_started_by_user_id_users_id_fk" FOREIGN KEY ("started_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flow_versions" ADD CONSTRAINT "flow_versions_flow_id_flows_id_fk" FOREIGN KEY ("flow_id") REFERENCES "public"."flows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flow_versions" ADD CONSTRAINT "flow_versions_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flows" ADD CONSTRAINT "flows_current_version_id_flow_versions_id_fk" FOREIGN KEY ("current_version_id") REFERENCES "public"."flow_versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flows" ADD CONSTRAINT "flows_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flows" ADD CONSTRAINT "flows_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "flow_run_steps_run_idx" ON "flow_run_steps" USING btree ("run_id","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "flow_runs_one_active_per_conversation_idx" ON "flow_runs" USING btree ("conversation_id") WHERE "flow_runs"."status" IN ('running', 'waiting');--> statement-breakpoint
CREATE INDEX "flow_runs_resume_at_idx" ON "flow_runs" USING btree ("resume_at") WHERE "flow_runs"."status" = 'waiting';--> statement-breakpoint
CREATE INDEX "flow_runs_flow_started_idx" ON "flow_runs" USING btree ("flow_id","started_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "flow_runs_finished_at_idx" ON "flow_runs" USING btree ("finished_at") WHERE "flow_runs"."finished_at" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_automation_opt_out_by_user_id_users_id_fk" FOREIGN KEY ("automation_opt_out_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_assumed_by_user_id_users_id_fk" FOREIGN KEY ("assumed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_flow_run_id_flow_runs_id_fk" FOREIGN KEY ("flow_run_id") REFERENCES "public"."flow_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_ai_agent_id_ai_agents_id_fk" FOREIGN KEY ("ai_agent_id") REFERENCES "public"."ai_agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_single_sender_check" CHECK (NOT ("messages"."sent_by_user_id" IS NOT NULL AND "messages"."flow_run_id" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "ai_providers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "ai_agents" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "flows" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "flow_versions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "flow_runs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "flow_run_steps" ENABLE ROW LEVEL SECURITY;
