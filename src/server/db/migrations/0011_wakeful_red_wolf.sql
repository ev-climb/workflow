ALTER TABLE "google_calendars" ADD COLUMN "full_synced_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "google_task_lists" ADD COLUMN "full_synced_at" timestamp with time zone;