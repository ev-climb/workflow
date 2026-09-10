ALTER TABLE "google_tasks" ADD COLUMN "start_time" time;--> statement-breakpoint
ALTER TABLE "google_tasks" ADD COLUMN "end_time" time;--> statement-breakpoint
ALTER TABLE "google_tasks" ADD CONSTRAINT "google_tasks_slot" CHECK (("google_tasks"."start_time" is null) = ("google_tasks"."end_time" is null)
          and ("google_tasks"."start_time" is null or ("google_tasks"."due" is not null and "google_tasks"."end_time" > "google_tasks"."start_time")));