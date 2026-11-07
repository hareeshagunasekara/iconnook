CREATE TABLE "collection_icons" (
	"collection_id" text NOT NULL,
	"icon_id" bigint NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "collection_icons_collection_id_icon_id_pk" PRIMARY KEY("collection_id","icon_id")
);
--> statement-breakpoint
CREATE TABLE "collections" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "collections_id_format" CHECK ("collections"."id" ~ '^[A-Za-z0-9_-]{10,32}$'),
	CONSTRAINT "collections_name_length" CHECK ("collections"."name" IS NULL OR char_length("collections"."name") <= 80)
);
--> statement-breakpoint
CREATE TABLE "download_flushes" (
	"id" text PRIMARY KEY NOT NULL,
	"applied_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "collection_icons" ADD CONSTRAINT "collection_icons_collection_id_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."collections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_icons" ADD CONSTRAINT "collection_icons_icon_id_icons_id_fk" FOREIGN KEY ("icon_id") REFERENCES "public"."icons"("id") ON DELETE cascade ON UPDATE no action;