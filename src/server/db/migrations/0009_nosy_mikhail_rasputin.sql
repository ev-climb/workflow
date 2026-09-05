CREATE TABLE "note_folders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"rank" text collate "C" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "note_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"note_id" uuid NOT NULL,
	"title" text NOT NULL,
	"done" boolean DEFAULT false NOT NULL,
	"rank" text collate "C" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"folder_id" uuid,
	"kind" text DEFAULT 'text' NOT NULL,
	"title" text,
	"body" text,
	"rank" text collate "C" NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notes_kind" CHECK ("notes"."kind" in ('text', 'list')),
	CONSTRAINT "notes_list_has_no_body" CHECK ("notes"."kind" = 'text' or "notes"."body" is null)
);
--> statement-breakpoint
ALTER TABLE "workspace_state" ADD COLUMN "notes_open" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "workspace_state" ADD COLUMN "note_drop_archives" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "note_items" ADD CONSTRAINT "note_items_note_id_notes_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."notes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_folder_id_note_folders_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."note_folders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "note_folders_rank_key" ON "note_folders" USING btree ("rank");--> statement-breakpoint
CREATE UNIQUE INDEX "note_items_note_id_rank_key" ON "note_items" USING btree ("note_id","rank");--> statement-breakpoint
CREATE UNIQUE INDEX "notes_rank_key" ON "notes" USING btree ("rank");--> statement-breakpoint
CREATE INDEX "notes_folder_id_idx" ON "notes" USING btree ("folder_id");