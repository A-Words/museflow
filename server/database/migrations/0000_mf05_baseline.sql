CREATE TABLE "accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"task_id" uuid,
	"output_slot" varchar(80),
	"kind" varchar(24) NOT NULL,
	"title" varchar(200) NOT NULL,
	"storage_key" text,
	"text_content" text,
	"mime_type" varchar(120),
	"bytes" bigint,
	"duration_ms" integer,
	"checksum" text,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"source_mode" varchar(16) NOT NULL,
	"parent_asset_id" uuid,
	"cover_asset_id" uuid,
	"status" varchar(32) NOT NULL,
	"deleted_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assets_id_owner_uq" UNIQUE("id","owner_id"),
	CONSTRAINT "assets_task_slot_check" CHECK ("assets"."task_id" is null or "assets"."output_slot" is not null),
	CONSTRAINT "assets_source_check" CHECK ("assets"."source_mode" in ('mock','real','manual')),
	CONSTRAINT "assets_bytes_check" CHECK ("assets"."bytes" is null or "assets"."bytes" >= 0),
	CONSTRAINT "assets_duration_check" CHECK ("assets"."duration_ms" is null or "assets"."duration_ms" >= 0)
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" text,
	"action" varchar(80) NOT NULL,
	"target_type" varchar(80) NOT NULL,
	"target_id" text NOT NULL,
	"reason" text,
	"change_summary" jsonb NOT NULL,
	"request_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"title" varchar(200) NOT NULL,
	"status" varchar(24) DEFAULT 'active' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "conversations_id_owner_uq" UNIQUE("id","owner_id")
);
--> statement-breakpoint
CREATE TABLE "credit_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"currency" varchar(24) NOT NULL,
	"available" bigint DEFAULT 0 NOT NULL,
	"held" bigint DEFAULT 0 NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "credit_accounts_id_owner_uq" UNIQUE("id","owner_id"),
	CONSTRAINT "credit_accounts_available_check" CHECK ("credit_accounts"."available" >= 0),
	CONSTRAINT "credit_accounts_held_check" CHECK ("credit_accounts"."held" >= 0),
	CONSTRAINT "credit_accounts_currency_check" CHECK ("credit_accounts"."currency" in ('creation','voice'))
);
--> statement-breakpoint
CREATE TABLE "credit_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"account_id" uuid NOT NULL,
	"task_id" uuid,
	"reservation_id" uuid,
	"kind" varchar(32) NOT NULL,
	"available_delta" bigint NOT NULL,
	"held_delta" bigint NOT NULL,
	"operation_key" text NOT NULL,
	"operator_id" text,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "credit_entries_operation_key_unique" UNIQUE("operation_key")
);
--> statement-breakpoint
CREATE TABLE "credit_reservations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"owner_id" text NOT NULL,
	"account_id" uuid NOT NULL,
	"amount" bigint NOT NULL,
	"state" varchar(16) DEFAULT 'held' NOT NULL,
	"finalized_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "credit_reservations_task_id_unique" UNIQUE("task_id"),
	CONSTRAINT "credit_reservations_id_owner_uq" UNIQUE("id","owner_id"),
	CONSTRAINT "credit_reservations_amount_check" CHECK ("credit_reservations"."amount" > 0),
	CONSTRAINT "credit_reservations_state_check" CHECK ("credit_reservations"."state" in ('held','captured','released'))
);
--> statement-breakpoint
CREATE TABLE "generation_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"conversation_id" uuid NOT NULL,
	"tool_call_id" uuid NOT NULL,
	"quote_id" uuid NOT NULL,
	"tool_name" varchar(80) NOT NULL,
	"status" varchar(32) NOT NULL,
	"source_mode" varchar(16) NOT NULL,
	"input_snapshot" jsonb NOT NULL,
	"provider_snapshot" jsonb NOT NULL,
	"entitlement_snapshot" jsonb NOT NULL,
	"retry_of_task_id" uuid,
	"error_code" varchar(80),
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "generation_tasks_quote_id_unique" UNIQUE("quote_id"),
	CONSTRAINT "generation_tasks_id_owner_uq" UNIQUE("id","owner_id"),
	CONSTRAINT "generation_tasks_source_check" CHECK ("generation_tasks"."source_mode" in ('mock','real','manual'))
);
--> statement-breakpoint
CREATE TABLE "idempotency_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"operation" varchar(80) NOT NULL,
	"key" text NOT NULL,
	"request_hash" varchar(128) NOT NULL,
	"resource_id" text NOT NULL,
	"response_snapshot" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"owner_id" text NOT NULL,
	"role" varchar(24) NOT NULL,
	"parts" jsonb NOT NULL,
	"metadata" jsonb,
	"schema_version" integer DEFAULT 1 NOT NULL,
	"status" varchar(24) NOT NULL,
	"client_message_id" text,
	"request_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "messages_schema_version_check" CHECK ("messages"."schema_version" > 0)
);
--> statement-breakpoint
CREATE TABLE "price_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tool_name" varchar(80) NOT NULL,
	"version" integer NOT NULL,
	"currency" varchar(24) NOT NULL,
	"specification" jsonb NOT NULL,
	"amount" bigint NOT NULL,
	"active_from" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "price_rules_amount_check" CHECK ("price_rules"."amount" >= 0),
	CONSTRAINT "price_rules_currency_check" CHECK ("price_rules"."currency" in ('creation','voice'))
);
--> statement-breakpoint
CREATE TABLE "provider_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider_key" varchar(80) NOT NULL,
	"version" integer NOT NULL,
	"kind" varchar(16) NOT NULL,
	"adapter_id" varchar(80) NOT NULL,
	"model_id" varchar(160) NOT NULL,
	"base_url" text,
	"credential_ref" text NOT NULL,
	"capabilities" jsonb NOT NULL,
	"parameter_mapping" jsonb NOT NULL,
	"source_mode" varchar(16) NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "provider_configs_id_kind_uq" UNIQUE("id","kind"),
	CONSTRAINT "provider_configs_id_kind_version_uq" UNIQUE("id","kind","version"),
	CONSTRAINT "provider_configs_kind_check" CHECK ("provider_configs"."kind" in ('text','music','tts')),
	CONSTRAINT "provider_configs_source_check" CHECK ("provider_configs"."source_mode" in ('mock','real')),
	CONSTRAINT "provider_configs_version_check" CHECK ("provider_configs"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "provider_defaults" (
	"kind" varchar(16) PRIMARY KEY NOT NULL,
	"provider_config_id" uuid NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "provider_defaults_kind_check" CHECK ("provider_defaults"."kind" in ('text','music','tts'))
);
--> statement-breakpoint
CREATE TABLE "quotes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"tool_call_id" uuid NOT NULL,
	"input_hash" varchar(128) NOT NULL,
	"input_snapshot" jsonb NOT NULL,
	"provider_snapshot" jsonb NOT NULL,
	"capability_snapshot" jsonb NOT NULL,
	"price_version" integer NOT NULL,
	"currency" varchar(24) NOT NULL,
	"amount" bigint NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "quotes_id_owner_tool_call_uq" UNIQUE("id","owner_id","tool_call_id"),
	CONSTRAINT "quotes_amount_check" CHECK ("quotes"."amount" >= 0),
	CONSTRAINT "quotes_currency_check" CHECK ("quotes"."currency" in ('creation','voice'))
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "sessions_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "task_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"attempt_no" integer NOT NULL,
	"dispatch_phase" varchar(32) NOT NULL,
	"provider_request_key" text NOT NULL,
	"provider_request_id" text,
	"provider_status" varchar(32),
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	CONSTRAINT "task_attempts_no_check" CHECK ("task_attempts"."attempt_no" > 0)
);
--> statement-breakpoint
CREATE TABLE "task_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"event_key" text NOT NULL,
	"from_status" varchar(32),
	"to_status" varchar(32) NOT NULL,
	"actor" text NOT NULL,
	"evidence_ref" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "task_events_event_key_unique" UNIQUE("event_key")
);
--> statement-breakpoint
CREATE TABLE "tool_calls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"conversation_id" uuid NOT NULL,
	"tool_name" varchar(80) NOT NULL,
	"input_snapshot" jsonb NOT NULL,
	"input_hash" varchar(128) NOT NULL,
	"status" varchar(24) NOT NULL,
	"confirmed_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tool_calls_id_owner_uq" UNIQUE("id","owner_id"),
	CONSTRAINT "tool_calls_id_owner_conversation_uq" UNIQUE("id","owner_id","conversation_id")
);
--> statement-breakpoint
CREATE TABLE "tool_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tool_name" varchar(80) NOT NULL,
	"version" integer NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"input_schema_version" integer NOT NULL,
	"capabilities" jsonb NOT NULL,
	"provider_kind" varchar(16) NOT NULL,
	"provider_ref" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tool_configs_kind_check" CHECK ("tool_configs"."provider_kind" in ('text','music','tts'))
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" varchar(320) NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"role" varchar(16) DEFAULT 'creator' NOT NULL,
	"status" varchar(16) DEFAULT 'active' NOT NULL,
	"personalization_enabled" boolean DEFAULT true NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_role_check" CHECK ("users"."role" in ('creator', 'admin')),
	CONSTRAINT "users_status_check" CHECK ("users"."status" in ('active', 'disabled'))
);
--> statement-breakpoint
CREATE TABLE "verifications" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_task_id_generation_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."generation_tasks"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_task_owner_fk" FOREIGN KEY ("task_id","owner_id") REFERENCES "public"."generation_tasks"("id","owner_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_parent_owner_fk" FOREIGN KEY ("parent_asset_id","owner_id") REFERENCES "public"."assets"("id","owner_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_cover_owner_fk" FOREIGN KEY ("cover_asset_id","owner_id") REFERENCES "public"."assets"("id","owner_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_accounts" ADD CONSTRAINT "credit_accounts_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_entries" ADD CONSTRAINT "credit_entries_account_id_credit_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."credit_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_entries" ADD CONSTRAINT "credit_entries_task_id_generation_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."generation_tasks"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_entries" ADD CONSTRAINT "credit_entries_reservation_id_credit_reservations_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."credit_reservations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_entries" ADD CONSTRAINT "credit_entries_operator_id_users_id_fk" FOREIGN KEY ("operator_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_entries" ADD CONSTRAINT "credit_entries_account_owner_fk" FOREIGN KEY ("account_id","owner_id") REFERENCES "public"."credit_accounts"("id","owner_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_entries" ADD CONSTRAINT "credit_entries_task_owner_fk" FOREIGN KEY ("task_id","owner_id") REFERENCES "public"."generation_tasks"("id","owner_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_entries" ADD CONSTRAINT "credit_entries_reservation_owner_fk" FOREIGN KEY ("reservation_id","owner_id") REFERENCES "public"."credit_reservations"("id","owner_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_reservations" ADD CONSTRAINT "credit_reservations_task_id_generation_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."generation_tasks"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_reservations" ADD CONSTRAINT "credit_reservations_account_id_credit_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."credit_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_reservations" ADD CONSTRAINT "credit_reservations_task_owner_fk" FOREIGN KEY ("task_id","owner_id") REFERENCES "public"."generation_tasks"("id","owner_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_reservations" ADD CONSTRAINT "credit_reservations_account_owner_fk" FOREIGN KEY ("account_id","owner_id") REFERENCES "public"."credit_accounts"("id","owner_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_tasks" ADD CONSTRAINT "generation_tasks_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_tasks" ADD CONSTRAINT "generation_tasks_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_tasks" ADD CONSTRAINT "generation_tasks_tool_call_id_tool_calls_id_fk" FOREIGN KEY ("tool_call_id") REFERENCES "public"."tool_calls"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_tasks" ADD CONSTRAINT "generation_tasks_quote_id_quotes_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."quotes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_tasks" ADD CONSTRAINT "generation_tasks_conversation_owner_fk" FOREIGN KEY ("conversation_id","owner_id") REFERENCES "public"."conversations"("id","owner_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_tasks" ADD CONSTRAINT "generation_tasks_tool_call_owner_conversation_fk" FOREIGN KEY ("tool_call_id","owner_id","conversation_id") REFERENCES "public"."tool_calls"("id","owner_id","conversation_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_tasks" ADD CONSTRAINT "generation_tasks_quote_owner_tool_call_fk" FOREIGN KEY ("quote_id","owner_id","tool_call_id") REFERENCES "public"."quotes"("id","owner_id","tool_call_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idempotency_records" ADD CONSTRAINT "idempotency_records_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_owner_fk" FOREIGN KEY ("conversation_id","owner_id") REFERENCES "public"."conversations"("id","owner_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_defaults" ADD CONSTRAINT "provider_defaults_provider_config_id_provider_configs_id_fk" FOREIGN KEY ("provider_config_id") REFERENCES "public"."provider_configs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_defaults" ADD CONSTRAINT "provider_defaults_config_kind_version_fk" FOREIGN KEY ("provider_config_id","kind","version") REFERENCES "public"."provider_configs"("id","kind","version") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_tool_call_id_tool_calls_id_fk" FOREIGN KEY ("tool_call_id") REFERENCES "public"."tool_calls"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_tool_call_owner_fk" FOREIGN KEY ("tool_call_id","owner_id") REFERENCES "public"."tool_calls"("id","owner_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_attempts" ADD CONSTRAINT "task_attempts_task_id_generation_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."generation_tasks"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_events" ADD CONSTRAINT "task_events_task_id_generation_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."generation_tasks"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tool_calls" ADD CONSTRAINT "tool_calls_conversation_owner_fk" FOREIGN KEY ("conversation_id","owner_id") REFERENCES "public"."conversations"("id","owner_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tool_configs" ADD CONSTRAINT "tool_configs_provider_ref_provider_configs_id_fk" FOREIGN KEY ("provider_ref") REFERENCES "public"."provider_configs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tool_configs" ADD CONSTRAINT "tool_configs_provider_kind_fk" FOREIGN KEY ("provider_ref","provider_kind") REFERENCES "public"."provider_configs"("id","kind") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "accounts_user_id_idx" ON "accounts" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "accounts_provider_identity_uq" ON "accounts" USING btree ("provider_id","account_id");--> statement-breakpoint
CREATE INDEX "assets_owner_date_idx" ON "assets" USING btree ("owner_id","created_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "assets_task_slot_uq" ON "assets" USING btree ("task_id","output_slot");--> statement-breakpoint
CREATE INDEX "audit_logs_target_idx" ON "audit_logs" USING btree ("target_type","target_id","created_at");--> statement-breakpoint
CREATE INDEX "conversations_owner_date_idx" ON "conversations" USING btree ("owner_id","created_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "credit_accounts_owner_currency_uq" ON "credit_accounts" USING btree ("owner_id","currency");--> statement-breakpoint
CREATE INDEX "credit_entries_account_date_idx" ON "credit_entries" USING btree ("account_id","created_at","id");--> statement-breakpoint
CREATE INDEX "generation_tasks_status_date_idx" ON "generation_tasks" USING btree ("status","created_at","id");--> statement-breakpoint
CREATE INDEX "generation_tasks_owner_date_idx" ON "generation_tasks" USING btree ("owner_id","created_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "idempotency_owner_operation_key_uq" ON "idempotency_records" USING btree ("owner_id","operation","key");--> statement-breakpoint
CREATE INDEX "messages_order_idx" ON "messages" USING btree ("conversation_id","created_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "messages_client_dedupe_uq" ON "messages" USING btree ("owner_id","conversation_id","client_message_id");--> statement-breakpoint
CREATE UNIQUE INDEX "price_rules_tool_version_uq" ON "price_rules" USING btree ("tool_name","version");--> statement-breakpoint
CREATE UNIQUE INDEX "provider_configs_key_version_uq" ON "provider_configs" USING btree ("provider_key","version");--> statement-breakpoint
CREATE INDEX "quotes_owner_idx" ON "quotes" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "sessions_user_id_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "task_attempts_task_no_uq" ON "task_attempts" USING btree ("task_id","attempt_no");--> statement-breakpoint
CREATE UNIQUE INDEX "task_attempts_provider_key_uq" ON "task_attempts" USING btree ("provider_request_key");--> statement-breakpoint
CREATE INDEX "task_events_task_date_idx" ON "task_events" USING btree ("task_id","created_at");--> statement-breakpoint
CREATE INDEX "tool_calls_owner_conversation_idx" ON "tool_calls" USING btree ("owner_id","conversation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tool_configs_name_version_uq" ON "tool_configs" USING btree ("tool_name","version");--> statement-breakpoint
CREATE INDEX "verifications_identifier_idx" ON "verifications" USING btree ("identifier");--> statement-breakpoint
CREATE FUNCTION reject_credit_entry_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'credit_entries are append-only';
END;
$$;--> statement-breakpoint
CREATE TRIGGER credit_entries_append_only BEFORE UPDATE OR DELETE ON credit_entries
FOR EACH ROW EXECUTE FUNCTION reject_credit_entry_mutation();
