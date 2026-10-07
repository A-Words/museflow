ALTER TABLE "generation_tasks" ADD CONSTRAINT "generation_tasks_retry_owner_fk" FOREIGN KEY ("retry_of_task_id","owner_id") REFERENCES "public"."generation_tasks"("id","owner_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE TRIGGER credit_entries_no_truncate BEFORE TRUNCATE ON credit_entries
FOR EACH STATEMENT EXECUTE FUNCTION reject_credit_entry_mutation();--> statement-breakpoint
CREATE FUNCTION reject_audit_log_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs are append-only';
END;
$$;--> statement-breakpoint
CREATE TRIGGER audit_logs_append_only BEFORE UPDATE OR DELETE ON audit_logs
FOR EACH ROW EXECUTE FUNCTION reject_audit_log_mutation();--> statement-breakpoint
CREATE TRIGGER audit_logs_no_truncate BEFORE TRUNCATE ON audit_logs
FOR EACH STATEMENT EXECUTE FUNCTION reject_audit_log_mutation();
