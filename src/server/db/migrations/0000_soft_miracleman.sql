CREATE TABLE "attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"card_id" uuid NOT NULL,
	"name" text NOT NULL,
	"path" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"mime_type" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "boards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"rank" text collate "C" NOT NULL,
	"trello_id" text,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "calendar_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"calendar_id" uuid NOT NULL,
	"google_event_id" text NOT NULL,
	"title" text,
	"description_html" text,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"all_day" boolean DEFAULT false NOT NULL,
	"start_date" date,
	"end_date" date,
	"etag" text,
	"google_updated_at" timestamp with time zone,
	"status" text DEFAULT 'confirmed' NOT NULL,
	"recurring_event_id" text,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "calendar_events_status" CHECK ("calendar_events"."status" in ('confirmed', 'tentative', 'cancelled')),
	CONSTRAINT "calendar_events_one_time_pair" CHECK (("calendar_events"."all_day"
             and "calendar_events"."start_date" is not null and "calendar_events"."end_date" is not null
             and "calendar_events"."starts_at" is null and "calendar_events"."ends_at" is null
             and "calendar_events"."end_date" > "calendar_events"."start_date")
          or (not "calendar_events"."all_day"
             and "calendar_events"."starts_at" is not null and "calendar_events"."ends_at" is not null
             and "calendar_events"."start_date" is null and "calendar_events"."end_date" is null
             and "calendar_events"."ends_at" >= "calendar_events"."starts_at"))
);
--> statement-breakpoint
CREATE TABLE "card_labels" (
	"card_id" uuid NOT NULL,
	"label_id" uuid NOT NULL,
	CONSTRAINT "card_labels_pkey" PRIMARY KEY("card_id","label_id")
);
--> statement-breakpoint
CREATE TABLE "cards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"list_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"rank" text collate "C" NOT NULL,
	"due_at" timestamp with time zone,
	"due_done" boolean DEFAULT false NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "checklist_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"checklist_id" uuid NOT NULL,
	"title" text NOT NULL,
	"done" boolean DEFAULT false NOT NULL,
	"rank" text collate "C" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "checklists" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"card_id" uuid NOT NULL,
	"title" text NOT NULL,
	"rank" text collate "C" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "google_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"refresh_token_encrypted" text NOT NULL,
	"access_token_encrypted" text,
	"access_token_expires_at" timestamp with time zone,
	"needs_reauth" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "google_calendars" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"google_calendar_id" text NOT NULL,
	"title" text NOT NULL,
	"color" text,
	"visible" boolean DEFAULT true NOT NULL,
	"sync_token" text,
	"synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "labels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"board_id" uuid NOT NULL,
	"name" text NOT NULL,
	"color" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lists" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"board_id" uuid NOT NULL,
	"title" text NOT NULL,
	"rank" text collate "C" NOT NULL,
	"wip_limit" integer,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lists_wip_limit_positive" CHECK ("lists"."wip_limit" is null or "lists"."wip_limit" > 0)
);
--> statement-breakpoint
CREATE TABLE "time_blocks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"card_id" uuid NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"calendar_id" uuid,
	"google_event_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "time_blocks_positive_length" CHECK ("time_blocks"."ends_at" > "time_blocks"."starts_at"),
	CONSTRAINT "time_blocks_mirror_complete" CHECK (("time_blocks"."calendar_id" is null) = ("time_blocks"."google_event_id" is null))
);
--> statement-breakpoint
CREATE TABLE "workspace_state" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"top_board_id" uuid,
	"bottom_board_id" uuid,
	"top_board_ratio" real DEFAULT 0.5 NOT NULL,
	"calendar_mode" text DEFAULT 'week' NOT NULL,
	"hidden_calendar_ids" uuid[] DEFAULT '{}' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspace_state_single_row" CHECK ("workspace_state"."id" = 1),
	CONSTRAINT "workspace_state_calendar_mode" CHECK ("workspace_state"."calendar_mode" in ('day', 'week')),
	CONSTRAINT "workspace_state_top_board_ratio" CHECK ("workspace_state"."top_board_ratio" > 0 and "workspace_state"."top_board_ratio" < 1)
);
--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_card_id_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."cards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_calendar_id_google_calendars_id_fk" FOREIGN KEY ("calendar_id") REFERENCES "public"."google_calendars"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_labels" ADD CONSTRAINT "card_labels_card_id_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."cards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_labels" ADD CONSTRAINT "card_labels_label_id_labels_id_fk" FOREIGN KEY ("label_id") REFERENCES "public"."labels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cards" ADD CONSTRAINT "cards_list_id_lists_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."lists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checklist_items" ADD CONSTRAINT "checklist_items_checklist_id_checklists_id_fk" FOREIGN KEY ("checklist_id") REFERENCES "public"."checklists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checklists" ADD CONSTRAINT "checklists_card_id_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."cards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "google_calendars" ADD CONSTRAINT "google_calendars_account_id_google_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."google_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "labels" ADD CONSTRAINT "labels_board_id_boards_id_fk" FOREIGN KEY ("board_id") REFERENCES "public"."boards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lists" ADD CONSTRAINT "lists_board_id_boards_id_fk" FOREIGN KEY ("board_id") REFERENCES "public"."boards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_blocks" ADD CONSTRAINT "time_blocks_card_id_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."cards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_blocks" ADD CONSTRAINT "time_blocks_calendar_id_google_calendars_id_fk" FOREIGN KEY ("calendar_id") REFERENCES "public"."google_calendars"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_state" ADD CONSTRAINT "workspace_state_top_board_id_boards_id_fk" FOREIGN KEY ("top_board_id") REFERENCES "public"."boards"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_state" ADD CONSTRAINT "workspace_state_bottom_board_id_boards_id_fk" FOREIGN KEY ("bottom_board_id") REFERENCES "public"."boards"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "attachments_card_id_idx" ON "attachments" USING btree ("card_id");--> statement-breakpoint
CREATE UNIQUE INDEX "boards_rank_key" ON "boards" USING btree ("rank");--> statement-breakpoint
CREATE UNIQUE INDEX "boards_trello_id_key" ON "boards" USING btree ("trello_id");--> statement-breakpoint
CREATE UNIQUE INDEX "calendar_events_calendar_id_google_event_id_key" ON "calendar_events" USING btree ("calendar_id","google_event_id");--> statement-breakpoint
CREATE INDEX "calendar_events_starts_at_idx" ON "calendar_events" USING btree ("starts_at");--> statement-breakpoint
CREATE INDEX "calendar_events_start_date_idx" ON "calendar_events" USING btree ("start_date");--> statement-breakpoint
CREATE INDEX "calendar_events_recurring_event_id_idx" ON "calendar_events" USING btree ("recurring_event_id");--> statement-breakpoint
CREATE INDEX "card_labels_label_id_idx" ON "card_labels" USING btree ("label_id");--> statement-breakpoint
CREATE UNIQUE INDEX "cards_list_id_rank_key" ON "cards" USING btree ("list_id","rank");--> statement-breakpoint
CREATE INDEX "cards_due_at_idx" ON "cards" USING btree ("due_at");--> statement-breakpoint
CREATE UNIQUE INDEX "checklist_items_checklist_id_rank_key" ON "checklist_items" USING btree ("checklist_id","rank");--> statement-breakpoint
CREATE UNIQUE INDEX "checklists_card_id_rank_key" ON "checklists" USING btree ("card_id","rank");--> statement-breakpoint
CREATE UNIQUE INDEX "google_accounts_email_key" ON "google_accounts" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "google_calendars_account_id_google_calendar_id_key" ON "google_calendars" USING btree ("account_id","google_calendar_id");--> statement-breakpoint
CREATE UNIQUE INDEX "labels_board_id_name_color_key" ON "labels" USING btree ("board_id","name","color");--> statement-breakpoint
CREATE UNIQUE INDEX "lists_board_id_rank_key" ON "lists" USING btree ("board_id","rank");--> statement-breakpoint
CREATE INDEX "time_blocks_card_id_idx" ON "time_blocks" USING btree ("card_id");--> statement-breakpoint
CREATE INDEX "time_blocks_starts_at_idx" ON "time_blocks" USING btree ("starts_at");