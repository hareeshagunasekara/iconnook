CREATE TYPE "public"."license_tier" AS ENUM('A', 'B', 'C');--> statement-breakpoint
CREATE TYPE "public"."set_type" AS ENUM('ui', 'color', 'developer', 'logos', 'emoji', 'flags', 'maps', 'themed', 'illustrations', 'archive');--> statement-breakpoint
CREATE TYPE "public"."tag_source" AS ENUM('set', 'auto', 'cldr', 'manual');--> statement-breakpoint
CREATE TABLE "categories" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "categories_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"slug" text NOT NULL,
	"label" text NOT NULL,
	"parent_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "downloads" (
	"icon_id" bigint NOT NULL,
	"day" date NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "downloads_icon_id_day_pk" PRIMARY KEY("icon_id","day"),
	CONSTRAINT "downloads_count_non_negative" CHECK ("downloads"."count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "icon_categories" (
	"icon_id" bigint NOT NULL,
	"category_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "icon_categories_icon_id_category_id_pk" PRIMARY KEY("icon_id","category_id")
);
--> statement-breakpoint
CREATE TABLE "icon_sets" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "icon_sets_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"prefix" text NOT NULL,
	"name" text NOT NULL,
	"author_name" text,
	"author_url" text,
	"license_spdx" text NOT NULL,
	"license_tier" "license_tier" NOT NULL,
	"license_url" text,
	"type" "set_type" NOT NULL,
	"is_color" boolean DEFAULT false NOT NULL,
	"grid_size" integer,
	"version" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "icon_sets_prefix_format" CHECK ("icon_sets"."prefix" ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);
--> statement-breakpoint
CREATE TABLE "icon_tags" (
	"icon_id" bigint NOT NULL,
	"tag_id" integer NOT NULL,
	"source" "tag_source" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "icon_tags_icon_id_tag_id_pk" PRIMARY KEY("icon_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "icons" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "icons_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"set_id" integer NOT NULL,
	"name" text NOT NULL,
	"body" text NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"hidden" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "icons_name_format" CHECK ("icons"."name" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
	CONSTRAINT "icons_dimensions_positive" CHECK ("icons"."width" > 0 AND "icons"."height" > 0)
);
--> statement-breakpoint
CREATE TABLE "tags" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "tags_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"slug" text NOT NULL,
	"label" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_parent_id_categories_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "downloads" ADD CONSTRAINT "downloads_icon_id_icons_id_fk" FOREIGN KEY ("icon_id") REFERENCES "public"."icons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "icon_categories" ADD CONSTRAINT "icon_categories_icon_id_icons_id_fk" FOREIGN KEY ("icon_id") REFERENCES "public"."icons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "icon_categories" ADD CONSTRAINT "icon_categories_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "icon_tags" ADD CONSTRAINT "icon_tags_icon_id_icons_id_fk" FOREIGN KEY ("icon_id") REFERENCES "public"."icons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "icon_tags" ADD CONSTRAINT "icon_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "icons" ADD CONSTRAINT "icons_set_id_icon_sets_id_fk" FOREIGN KEY ("set_id") REFERENCES "public"."icon_sets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "categories_slug_key" ON "categories" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "icon_categories_category_id_idx" ON "icon_categories" USING btree ("category_id");--> statement-breakpoint
CREATE UNIQUE INDEX "icon_sets_prefix_key" ON "icon_sets" USING btree ("prefix");--> statement-breakpoint
CREATE INDEX "icon_tags_tag_id_idx" ON "icon_tags" USING btree ("tag_id");--> statement-breakpoint
CREATE UNIQUE INDEX "icons_set_id_name_key" ON "icons" USING btree ("set_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "tags_slug_key" ON "tags" USING btree ("slug");