-- до отдельной таблицы у пункта «Сегодня» была одна отметка: переносится как отметка своего дня
INSERT INTO "daily_marks" ("item_id", "day")
SELECT "note_items"."id", "note_items"."done_on"
FROM "note_items"
JOIN "notes" ON "notes"."id" = "note_items"."note_id"
WHERE "notes"."daily" AND "note_items"."done" AND "note_items"."done_on" IS NOT NULL;
--> statement-breakpoint
UPDATE "note_items" SET "done" = false
FROM "notes"
WHERE "notes"."id" = "note_items"."note_id" AND "notes"."daily";
