CREATE TABLE "daily_results" (
	"day" date PRIMARY KEY NOT NULL,
	"total" integer NOT NULL,
	"done" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "daily_results_done" CHECK ("daily_results"."done" between 0 and "daily_results"."total")
);
--> statement-breakpoint
ALTER TABLE "note_items" ADD COLUMN "done_on" date;--> statement-breakpoint
ALTER TABLE "notes" ADD COLUMN "daily" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "notes_daily_key" ON "notes" USING btree ("daily") WHERE "notes"."daily";