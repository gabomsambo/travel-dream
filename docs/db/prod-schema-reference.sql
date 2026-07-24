-- travel-dream PRODUCTION schema (read-only dump) — ground truth for baselining
-- captured 69 objects; NO row data included
--
-- Captured 2026-07-24 from the production Turso database, schema only, no rows.
-- This is the reference `src/db/migrations/0000_baseline.sql` was built to reproduce.
-- Verify with: node scripts/verify-baseline-schema.mjs
-- Do not hand-edit. To refresh: turso db shell <db> ".schema" (read-only) and re-verify.

-- [table] __drizzle_migrations
CREATE TABLE "__drizzle_migrations" (
			id SERIAL PRIMARY KEY,
			hash text NOT NULL,
			created_at numeric
		);

-- [table] accounts
CREATE TABLE accounts (
      user_id text NOT NULL,
      type text NOT NULL,
      provider text NOT NULL,
      provider_account_id text NOT NULL,
      refresh_token text,
      access_token text,
      expires_at integer,
      token_type text,
      scope text,
      id_token text,
      session_state text,
      PRIMARY KEY(provider, provider_account_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

-- [table] attachments
CREATE TABLE `attachments` (
	`id` text PRIMARY KEY NOT NULL,
	`place_id` text NOT NULL,
	`type` text NOT NULL,
	`uri` text NOT NULL,
	`filename` text NOT NULL,
	`mime_type` text,
	`file_size` integer,
	`width` integer,
	`height` integer,
	`thumbnail_uri` text,
	`caption` text,
	`taken_at` text,
	`is_primary` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL, `source` text DEFAULT 'upload' NOT NULL, `source_id` text, `attribution` text,
	FOREIGN KEY (`place_id`) REFERENCES `places`(`id`) ON UPDATE no action ON DELETE cascade
);

-- [table] collections
CREATE TABLE `collections` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`filters` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
, transport_mode TEXT DEFAULT 'drive' NOT NULL, day_buckets TEXT DEFAULT '[]' NOT NULL, unscheduled_place_ids TEXT DEFAULT '[]' NOT NULL, cover_image_url TEXT, user_id text REFERENCES users(id) ON DELETE CASCADE);

-- [table] dismissed_duplicates
CREATE TABLE dismissed_duplicates (id text PRIMARY KEY NOT NULL, place_id_1 text NOT NULL, place_id_2 text NOT NULL, reason text, dismissed_at text DEFAULT CURRENT_TIMESTAMP NOT NULL, `user_id` text REFERENCES users(id));

-- [table] merge_logs
CREATE TABLE merge_logs (id text PRIMARY KEY NOT NULL, target_id text NOT NULL, source_ids text NOT NULL, merged_data text, source_snapshots text, confidence real NOT NULL, performed_by text DEFAULT 'user' NOT NULL, performed_at text DEFAULT CURRENT_TIMESTAMP NOT NULL, undone integer DEFAULT false NOT NULL, undon_at text);

-- [table] place_links
CREATE TABLE `place_links` (
	`id` text PRIMARY KEY NOT NULL,
	`place_id` text NOT NULL,
	`url` text NOT NULL,
	`title` text,
	`description` text,
	`type` text,
	`platform` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`place_id`) REFERENCES `places`(`id`) ON UPDATE no action ON DELETE cascade
);

-- [table] places
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
, price_level TEXT, best_time TEXT, activities TEXT, cuisine TEXT, amenities TEXT, description TEXT, `website` text, `phone` text, `email` text, `hours` text, `visit_status` text DEFAULT 'not_visited', `priority` integer DEFAULT 0, `last_visited` text, `planned_visit` text, `recommended_by` text, `companions` text, `practical_info` text, google_place_id TEXT, user_id text REFERENCES users(id) ON DELETE CASCADE);

-- [table] places_to_collections
CREATE TABLE `places_to_collections` (
	`place_id` text NOT NULL,
	`collection_id` text NOT NULL,
	`order_index` integer DEFAULT 0 NOT NULL, is_pinned INTEGER DEFAULT 0 NOT NULL, note TEXT,
	PRIMARY KEY(`place_id`, `collection_id`),
	FOREIGN KEY (`place_id`) REFERENCES `places`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`collection_id`) REFERENCES `collections`(`id`) ON UPDATE no action ON DELETE cascade
);

-- [table] reservations
CREATE TABLE `reservations` (
	`id` text PRIMARY KEY NOT NULL,
	`place_id` text NOT NULL,
	`reservation_date` text NOT NULL,
	`reservation_time` text,
	`confirmation_number` text,
	`status` text DEFAULT 'confirmed' NOT NULL,
	`party_size` integer,
	`booking_platform` text,
	`booking_url` text,
	`special_requests` text,
	`total_cost` text,
	`notes` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`place_id`) REFERENCES `places`(`id`) ON UPDATE no action ON DELETE cascade
);

-- [table] sessions
CREATE TABLE sessions (
      session_token text PRIMARY KEY NOT NULL,
      user_id text NOT NULL,
      expires integer NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

-- [table] sources
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
, user_id text REFERENCES users(id) ON DELETE CASCADE, processing_status text DEFAULT 'pending', processing_attempts integer DEFAULT 0, processing_error text, processing_started_at text);

-- [table] sources_to_places
CREATE TABLE `sources_to_places` (
	`source_id` text NOT NULL,
	`place_id` text NOT NULL,
	PRIMARY KEY(`source_id`, `place_id`),
	FOREIGN KEY (`source_id`) REFERENCES `sources`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`place_id`) REFERENCES `places`(`id`) ON UPDATE no action ON DELETE cascade
);

-- [table] upload_sessions
CREATE TABLE `upload_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`started_at` text NOT NULL,
	`file_count` integer DEFAULT 0 NOT NULL,
	`completed_count` integer DEFAULT 0 NOT NULL,
	`failed_count` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`meta` text
, user_id text REFERENCES users(id) ON DELETE CASCADE);

-- [table] users
CREATE TABLE users (
      id text PRIMARY KEY NOT NULL,
      name text,
      email text NOT NULL UNIQUE,
      email_verified integer,
      image text,
      hashed_password text,
      created_at text DEFAULT CURRENT_TIMESTAMP NOT NULL,
      updated_at text DEFAULT CURRENT_TIMESTAMP NOT NULL
    );

-- [table] verification_tokens
CREATE TABLE verification_tokens (
      identifier text NOT NULL,
      token text NOT NULL,
      expires integer NOT NULL,
      PRIMARY KEY(identifier, token)
    );

-- [index] accounts_user_idx
CREATE INDEX accounts_user_idx ON accounts(user_id);

-- [index] attachments_created_at_idx
CREATE INDEX `attachments_created_at_idx` ON `attachments` (`created_at`);

-- [index] attachments_place_id_idx
CREATE INDEX `attachments_place_id_idx` ON `attachments` (`place_id`);

-- [index] attachments_primary_idx
CREATE INDEX `attachments_primary_idx` ON `attachments` (`place_id`,`is_primary`);

-- [index] attachments_source_idx
CREATE INDEX `attachments_source_idx` ON `attachments` (`source`);

-- [index] attachments_source_place_idx
CREATE INDEX `attachments_source_place_idx` ON `attachments` (`place_id`,`source`);

-- [index] attachments_type_idx
CREATE INDEX `attachments_type_idx` ON `attachments` (`type`);

-- [index] attachments_type_place_id_idx
CREATE INDEX `attachments_type_place_id_idx` ON `attachments` (`type`,`place_id`);

-- [index] collections_created_at_idx
CREATE INDEX `collections_created_at_idx` ON `collections` (`created_at`);

-- [index] collections_name_idx
CREATE INDEX `collections_name_idx` ON `collections` (`name`);

-- [index] collections_user_idx
CREATE INDEX collections_user_idx ON collections(user_id);

-- [index] dismissed_duplicates_pair_idx
CREATE INDEX dismissed_duplicates_pair_idx ON dismissed_duplicates (place_id_1, place_id_2);

-- [index] dismissed_duplicates_user_idx
CREATE INDEX `dismissed_duplicates_user_idx` ON `dismissed_duplicates` (`user_id`);

-- [index] dismissed_duplicates_user_pair_idx
CREATE INDEX `dismissed_duplicates_user_pair_idx` ON `dismissed_duplicates` (`user_id`,`place_id_1`,`place_id_2`);

-- [index] merge_logs_performed_at_idx
CREATE INDEX merge_logs_performed_at_idx ON merge_logs (performed_at);

-- [index] merge_logs_target_idx
CREATE INDEX merge_logs_target_idx ON merge_logs (target_id);

-- [index] merge_logs_undone_idx
CREATE INDEX merge_logs_undone_idx ON merge_logs (undone);

-- [index] place_links_place_id_idx
CREATE INDEX `place_links_place_id_idx` ON `place_links` (`place_id`);

-- [index] place_links_platform_idx
CREATE INDEX `place_links_platform_idx` ON `place_links` (`platform`);

-- [index] place_links_type_idx
CREATE INDEX `place_links_type_idx` ON `place_links` (`type`);

-- [index] places_city_country_idx
CREATE INDEX `places_city_country_idx` ON `places` (`city`,`country`);

-- [index] places_city_kind_idx
CREATE INDEX `places_city_kind_idx` ON `places` (`city`,`kind`);

-- [index] places_confidence_idx
CREATE INDEX `places_confidence_idx` ON `places` (`confidence`);

-- [index] places_created_at_idx
CREATE INDEX `places_created_at_idx` ON `places` (`created_at`);

-- [index] places_kind_idx
CREATE INDEX `places_kind_idx` ON `places` (`kind`);

-- [index] places_last_visited_idx
CREATE INDEX `places_last_visited_idx` ON `places` (`last_visited`);

-- [index] places_name_idx
CREATE INDEX `places_name_idx` ON `places` (`name`);

-- [index] places_planned_visit_idx
CREATE INDEX `places_planned_visit_idx` ON `places` (`planned_visit`);

-- [index] places_priority_idx
CREATE INDEX `places_priority_idx` ON `places` (`priority`);

-- [index] places_status_idx
CREATE INDEX `places_status_idx` ON `places` (`status`);

-- [index] places_status_kind_idx
CREATE INDEX `places_status_kind_idx` ON `places` (`status`,`kind`);

-- [index] places_user_idx
CREATE INDEX places_user_idx ON places(user_id);

-- [index] places_user_status_idx
CREATE INDEX places_user_status_idx ON places(user_id, status);

-- [index] places_visit_status_idx
CREATE INDEX `places_visit_status_idx` ON `places` (`visit_status`);

-- [index] places_to_collections_collection_idx
CREATE INDEX `places_to_collections_collection_idx` ON `places_to_collections` (`collection_id`);

-- [index] places_to_collections_order_idx
CREATE INDEX `places_to_collections_order_idx` ON `places_to_collections` (`collection_id`,`order_index`);

-- [index] places_to_collections_pinned_idx
CREATE INDEX places_to_collections_pinned_idx
      ON places_to_collections(collection_id, is_pinned);

-- [index] places_to_collections_place_idx
CREATE INDEX `places_to_collections_place_idx` ON `places_to_collections` (`place_id`);

-- [index] reservations_date_idx
CREATE INDEX `reservations_date_idx` ON `reservations` (`reservation_date`);

-- [index] reservations_place_id_idx
CREATE INDEX `reservations_place_id_idx` ON `reservations` (`place_id`);

-- [index] reservations_status_idx
CREATE INDEX `reservations_status_idx` ON `reservations` (`status`);

-- [index] sessions_user_idx
CREATE INDEX sessions_user_idx ON sessions(user_id);

-- [index] sources_created_at_idx
CREATE INDEX `sources_created_at_idx` ON `sources` (`created_at`);

-- [index] sources_processing_status_idx
CREATE INDEX sources_processing_status_idx ON sources (processing_status, user_id);

-- [index] sources_type_idx
CREATE INDEX `sources_type_idx` ON `sources` (`type`);

-- [index] sources_uri_idx
CREATE INDEX `sources_uri_idx` ON `sources` (`uri`);

-- [index] sources_user_idx
CREATE INDEX sources_user_idx ON sources(user_id);

-- [index] sources_to_places_place_idx
CREATE INDEX `sources_to_places_place_idx` ON `sources_to_places` (`place_id`);

-- [index] sources_to_places_source_idx
CREATE INDEX `sources_to_places_source_idx` ON `sources_to_places` (`source_id`);

-- [index] upload_sessions_started_at_idx
CREATE INDEX `upload_sessions_started_at_idx` ON `upload_sessions` (`started_at`);

-- [index] upload_sessions_status_idx
CREATE INDEX `upload_sessions_status_idx` ON `upload_sessions` (`status`);

-- [index] upload_sessions_user_idx
CREATE INDEX upload_sessions_user_idx ON upload_sessions(user_id);

-- [index] users_email_idx
CREATE INDEX users_email_idx ON users(email);

