CREATE TABLE "daily_marks" (
	"item_id" uuid NOT NULL,
	"day" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "daily_marks_pkey" PRIMARY KEY("item_id","day")
);
--> statement-breakpoint
ALTER TABLE "daily_marks" ADD CONSTRAINT "daily_marks_item_id_note_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."note_items"("id") ON DELETE cascade ON UPDATE no action;