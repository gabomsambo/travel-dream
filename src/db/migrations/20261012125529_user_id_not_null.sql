-- Abort before any rebuild if a tenant row has no owner. Inserting those
-- rows into the NOT NULL copies would fail too, but only after tables had
-- already been replaced. A 0 here violates the named CHECK and stops the run.
CREATE TABLE `__userid_not_null_guard` (
	`ok` integer PRIMARY KEY CONSTRAINT user_id_not_null_guard CHECK (`ok` = 1)
);
--> statement-breakpoint
INSERT INTO `__userid_not_null_guard` (`ok`)
SELECT CASE WHEN (
	(SELECT COUNT(*) FROM `places` WHERE `user_id` IS NULL)
	+ (SELECT COUNT(*) FROM `sources` WHERE `user_id` IS NULL)
	+ (SELECT COUNT(*) FROM `collections` WHERE `user_id` IS NULL)
	+ (SELECT COUNT(*) FROM `upload_sessions` WHERE `user_id` IS NULL)
	+ (SELECT COUNT(*) FROM `dismissed_duplicates` WHERE `user_id` IS NULL)
) = 0 THEN 1 ELSE 0 END;
--> statement-breakpoint
DROP TABLE `__userid_not_null_guard`;
--> statement-breakpoint
-- Stay off until every rebuilt table is renamed. SQLite's DROP TABLE, when
-- foreign keys are on, runs an implicit DELETE that fires ON DELETE CASCADE
-- and would wipe rows in tables that point at places, sources, or collections.
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_collections` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`filters` text,
	`cover_image_url` text,
	`transport_mode` text DEFAULT 'drive' NOT NULL,
	`day_buckets` text DEFAULT '[]' NOT NULL,
	`unscheduled_place_ids` text DEFAULT '[]' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_collections`("id", "user_id", "name", "description", "filters", "cover_image_url", "transport_mode", "day_buckets", "unscheduled_place_ids", "created_at", "updated_at") SELECT "id", "user_id", "name", "description", "filters", "cover_image_url", "transport_mode", "day_buckets", "unscheduled_place_ids", "created_at", "updated_at" FROM `collections`;--> statement-breakpoint
DROP TABLE `collections`;--> statement-breakpoint
ALTER TABLE `__new_collections` RENAME TO `collections`;--> statement-breakpoint
CREATE INDEX `collections_name_idx` ON `collections` (`name`);--> statement-breakpoint
CREATE INDEX `collections_created_at_idx` ON `collections` (`created_at`);--> statement-breakpoint
CREATE INDEX `collections_user_idx` ON `collections` (`user_id`);--> statement-breakpoint
CREATE TABLE `__new_dismissed_duplicates` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`place_id_1` text NOT NULL,
	`place_id_2` text NOT NULL,
	`reason` text,
	`dismissed_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_dismissed_duplicates`("id", "user_id", "place_id_1", "place_id_2", "reason", "dismissed_at") SELECT "id", "user_id", "place_id_1", "place_id_2", "reason", "dismissed_at" FROM `dismissed_duplicates`;--> statement-breakpoint
DROP TABLE `dismissed_duplicates`;--> statement-breakpoint
ALTER TABLE `__new_dismissed_duplicates` RENAME TO `dismissed_duplicates`;--> statement-breakpoint
CREATE INDEX `dismissed_duplicates_pair_idx` ON `dismissed_duplicates` (`place_id_1`,`place_id_2`);--> statement-breakpoint
CREATE INDEX `dismissed_duplicates_user_idx` ON `dismissed_duplicates` (`user_id`);--> statement-breakpoint
CREATE INDEX `dismissed_duplicates_user_pair_idx` ON `dismissed_duplicates` (`user_id`,`place_id_1`,`place_id_2`);--> statement-breakpoint
CREATE TABLE `__new_places` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`city` text,
	`country` text,
	`admin` text,
	`coords` text,
	`address` text,
	`google_place_id` text,
	`alt_names` text DEFAULT '[]',
	`description` text,
	`tags` text DEFAULT '[]',
	`vibes` text DEFAULT '[]',
	`rating_self` integer DEFAULT 0,
	`notes` text,
	`status` text DEFAULT 'inbox' NOT NULL,
	`confidence` real DEFAULT 0,
	`price_level` text,
	`best_time` text,
	`activities` text,
	`cuisine` text,
	`amenities` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`archived_at` text,
	`website` text,
	`phone` text,
	`email` text,
	`hours` text,
	`visit_status` text DEFAULT 'not_visited',
	`priority` integer DEFAULT 0,
	`last_visited` text,
	`planned_visit` text,
	`recommended_by` text,
	`companions` text,
	`practical_info` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_places`("id", "user_id", "name", "kind", "city", "country", "admin", "coords", "address", "google_place_id", "alt_names", "description", "tags", "vibes", "rating_self", "notes", "status", "confidence", "price_level", "best_time", "activities", "cuisine", "amenities", "created_at", "updated_at", "archived_at", "website", "phone", "email", "hours", "visit_status", "priority", "last_visited", "planned_visit", "recommended_by", "companions", "practical_info") SELECT "id", "user_id", "name", "kind", "city", "country", "admin", "coords", "address", "google_place_id", "alt_names", "description", "tags", "vibes", "rating_self", "notes", "status", "confidence", "price_level", "best_time", "activities", "cuisine", "amenities", "created_at", "updated_at", "archived_at", "website", "phone", "email", "hours", "visit_status", "priority", "last_visited", "planned_visit", "recommended_by", "companions", "practical_info" FROM `places`;--> statement-breakpoint
DROP TABLE `places`;--> statement-breakpoint
ALTER TABLE `__new_places` RENAME TO `places`;--> statement-breakpoint
CREATE INDEX `places_city_country_idx` ON `places` (`city`,`country`);--> statement-breakpoint
CREATE INDEX `places_kind_idx` ON `places` (`kind`);--> statement-breakpoint
CREATE INDEX `places_status_idx` ON `places` (`status`);--> statement-breakpoint
CREATE INDEX `places_name_idx` ON `places` (`name`);--> statement-breakpoint
CREATE INDEX `places_confidence_idx` ON `places` (`confidence`);--> statement-breakpoint
CREATE INDEX `places_created_at_idx` ON `places` (`created_at`);--> statement-breakpoint
CREATE INDEX `places_status_kind_idx` ON `places` (`status`,`kind`);--> statement-breakpoint
CREATE INDEX `places_city_kind_idx` ON `places` (`city`,`kind`);--> statement-breakpoint
CREATE INDEX `places_visit_status_idx` ON `places` (`visit_status`);--> statement-breakpoint
CREATE INDEX `places_priority_idx` ON `places` (`priority`);--> statement-breakpoint
CREATE INDEX `places_last_visited_idx` ON `places` (`last_visited`);--> statement-breakpoint
CREATE INDEX `places_planned_visit_idx` ON `places` (`planned_visit`);--> statement-breakpoint
CREATE INDEX `places_user_idx` ON `places` (`user_id`);--> statement-breakpoint
CREATE INDEX `places_user_status_idx` ON `places` (`user_id`,`status`);--> statement-breakpoint
CREATE TABLE `__new_sources` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`type` text NOT NULL,
	`uri` text NOT NULL,
	`hash` text,
	`ocr_text` text,
	`lang` text DEFAULT 'en',
	`meta` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`processing_status` text DEFAULT 'pending',
	`processing_attempts` integer DEFAULT 0,
	`processing_interruptions` integer DEFAULT 0,
	`processing_error` text,
	`processing_started_at` text,
	`processing_lease_id` text,
	`next_attempt_at` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_sources`("id", "user_id", "type", "uri", "hash", "ocr_text", "lang", "meta", "created_at", "updated_at", "processing_status", "processing_attempts", "processing_interruptions", "processing_error", "processing_started_at", "processing_lease_id", "next_attempt_at") SELECT "id", "user_id", "type", "uri", "hash", "ocr_text", "lang", "meta", "created_at", "updated_at", "processing_status", "processing_attempts", "processing_interruptions", "processing_error", "processing_started_at", "processing_lease_id", "next_attempt_at" FROM `sources`;--> statement-breakpoint
DROP TABLE `sources`;--> statement-breakpoint
ALTER TABLE `__new_sources` RENAME TO `sources`;--> statement-breakpoint
CREATE INDEX `sources_type_idx` ON `sources` (`type`);--> statement-breakpoint
CREATE INDEX `sources_uri_idx` ON `sources` (`uri`);--> statement-breakpoint
CREATE INDEX `sources_created_at_idx` ON `sources` (`created_at`);--> statement-breakpoint
CREATE INDEX `sources_user_idx` ON `sources` (`user_id`);--> statement-breakpoint
CREATE INDEX `sources_processing_status_idx` ON `sources` (`processing_status`,`user_id`);--> statement-breakpoint
CREATE TABLE `__new_upload_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`started_at` text NOT NULL,
	`file_count` integer DEFAULT 0 NOT NULL,
	`completed_count` integer DEFAULT 0 NOT NULL,
	`failed_count` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`meta` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_upload_sessions`("id", "user_id", "started_at", "file_count", "completed_count", "failed_count", "status", "meta") SELECT "id", "user_id", "started_at", "file_count", "completed_count", "failed_count", "status", "meta" FROM `upload_sessions`;--> statement-breakpoint
DROP TABLE `upload_sessions`;--> statement-breakpoint
ALTER TABLE `__new_upload_sessions` RENAME TO `upload_sessions`;--> statement-breakpoint
CREATE INDEX `upload_sessions_status_idx` ON `upload_sessions` (`status`);--> statement-breakpoint
CREATE INDEX `upload_sessions_started_at_idx` ON `upload_sessions` (`started_at`);--> statement-breakpoint
CREATE INDEX `upload_sessions_user_idx` ON `upload_sessions` (`user_id`);--> statement-breakpoint
PRAGMA foreign_keys=ON;