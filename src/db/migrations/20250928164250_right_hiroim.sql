CREATE TABLE `collections` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`filters` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `places` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`city` text,
	`country` text,
	`admin` text,
	`coords` text,
	`address` text,
	`alt_names` text DEFAULT '[]',
	`tags` text DEFAULT '[]',
	`vibes` text DEFAULT '[]',
	`rating_self` integer DEFAULT 0,
	`notes` text,
	`status` text DEFAULT 'inbox' NOT NULL,
	`confidence` real DEFAULT 0,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `places_to_collections` (
	`place_id` text NOT NULL,
	`collection_id` text NOT NULL,
	`order_index` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`place_id`, `collection_id`),
	FOREIGN KEY (`place_id`) REFERENCES `places`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`collection_id`) REFERENCES `collections`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `sources` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`uri` text NOT NULL,
	`hash` text,
	`ocr_text` text,
	`lang` text DEFAULT 'en',
	`meta` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sources_to_places` (
	`source_id` text NOT NULL,
	`place_id` text NOT NULL,
	PRIMARY KEY(`source_id`, `place_id`),
	FOREIGN KEY (`source_id`) REFERENCES `sources`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`place_id`) REFERENCES `places`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `upload_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`started_at` text NOT NULL,
	`file_count` integer DEFAULT 0 NOT NULL,
	`completed_count` integer DEFAULT 0 NOT NULL,
	`failed_count` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`meta` text
);
--> statement-breakpoint
CREATE INDEX `collections_name_idx` ON `collections` (`name`);--> statement-breakpoint
CREATE INDEX `collections_created_at_idx` ON `collections` (`created_at`);--> statement-breakpoint
CREATE INDEX `places_city_country_idx` ON `places` (`city`,`country`);--> statement-breakpoint
CREATE INDEX `places_kind_idx` ON `places` (`kind`);--> statement-breakpoint
CREATE INDEX `places_status_idx` ON `places` (`status`);--> statement-breakpoint
CREATE INDEX `places_name_idx` ON `places` (`name`);--> statement-breakpoint
CREATE INDEX `places_confidence_idx` ON `places` (`confidence`);--> statement-breakpoint
CREATE INDEX `places_created_at_idx` ON `places` (`created_at`);--> statement-breakpoint
CREATE INDEX `places_status_kind_idx` ON `places` (`status`,`kind`);--> statement-breakpoint
CREATE INDEX `places_city_kind_idx` ON `places` (`city`,`kind`);--> statement-breakpoint
CREATE INDEX `places_to_collections_place_idx` ON `places_to_collections` (`place_id`);--> statement-breakpoint
CREATE INDEX `places_to_collections_collection_idx` ON `places_to_collections` (`collection_id`);--> statement-breakpoint
CREATE INDEX `places_to_collections_order_idx` ON `places_to_collections` (`collection_id`,`order_index`);--> statement-breakpoint
CREATE INDEX `sources_type_idx` ON `sources` (`type`);--> statement-breakpoint
CREATE INDEX `sources_uri_idx` ON `sources` (`uri`);--> statement-breakpoint
CREATE INDEX `sources_created_at_idx` ON `sources` (`created_at`);--> statement-breakpoint
CREATE INDEX `sources_to_places_source_idx` ON `sources_to_places` (`source_id`);--> statement-breakpoint
CREATE INDEX `sources_to_places_place_idx` ON `sources_to_places` (`place_id`);--> statement-breakpoint
CREATE INDEX `upload_sessions_status_idx` ON `upload_sessions` (`status`);--> statement-breakpoint
CREATE INDEX `upload_sessions_started_at_idx` ON `upload_sessions` (`started_at`);