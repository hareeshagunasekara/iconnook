ALTER TABLE "icon_sets" ADD COLUMN "icon_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
-- Backfill existing sets (the importer keeps this up to date from now on).
UPDATE "icon_sets" s SET "icon_count" = (SELECT count(*) FROM "icons" i WHERE i."set_id" = s."id" AND NOT i."hidden");
