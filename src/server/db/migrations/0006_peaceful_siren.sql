CREATE TABLE "google_task_lists" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"google_task_list_id" text NOT NULL,
	"title" text NOT NULL,
	"updated_min" timestamp with time zone,
	"synced_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "google_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"task_list_id" uuid NOT NULL,
	"google_task_id" text NOT NULL,
	"title" text,
	"notes" text,
	"due" date,
	"status" text DEFAULT 'needsAction' NOT NULL,
	"completed_at" timestamp with time zone,
	"etag" text,
	"google_updated_at" timestamp with time zone,
	"web_view_link" text,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "google_tasks_status" CHECK ("google_tasks"."status" in ('needsAction', 'completed'))
);
--> statement-breakpoint
ALTER TABLE "google_task_lists" ADD CONSTRAINT "google_task_lists_account_id_google_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."google_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "google_tasks" ADD CONSTRAINT "google_tasks_account_id_google_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."google_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "google_tasks" ADD CONSTRAINT "google_tasks_task_list_id_google_task_lists_id_fk" FOREIGN KEY ("task_list_id") REFERENCES "public"."google_task_lists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "google_task_lists_account_id_google_task_list_id_key" ON "google_task_lists" USING btree ("account_id","google_task_list_id");--> statement-breakpoint
CREATE UNIQUE INDEX "google_tasks_account_id_google_task_id_key" ON "google_tasks" USING btree ("account_id","google_task_id");--> statement-breakpoint
CREATE INDEX "google_tasks_task_list_id_idx" ON "google_tasks" USING btree ("task_list_id");--> statement-breakpoint
CREATE INDEX "google_tasks_due_idx" ON "google_tasks" USING btree ("due");