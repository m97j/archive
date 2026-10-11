ALTER TABLE "outbox_events" ADD COLUMN "locked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "outbox_events" ADD COLUMN "locked_by" varchar(160);--> statement-breakpoint
ALTER TABLE "outbox_events" ADD COLUMN "max_attempts" integer DEFAULT 8 NOT NULL;--> statement-breakpoint
ALTER TABLE "outbox_events" ADD CONSTRAINT "outbox_events_attempts_valid" CHECK ("outbox_events"."attempts" >= 0 and "outbox_events"."max_attempts" > 0);