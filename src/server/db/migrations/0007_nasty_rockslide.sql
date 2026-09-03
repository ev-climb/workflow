ALTER TABLE "calendar_events" ADD COLUMN "google_task_id" text;--> statement-breakpoint
CREATE INDEX "calendar_events_google_task_id_idx" ON "calendar_events" USING btree ("google_task_id");