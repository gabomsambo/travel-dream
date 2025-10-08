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
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`place_id`) REFERENCES `places`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
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
--> statement-breakpoint
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
--> statement-breakpoint
ALTER TABLE `places` ADD `website` text;--> statement-breakpoint
ALTER TABLE `places` ADD `phone` text;--> statement-breakpoint
ALTER TABLE `places` ADD `email` text;--> statement-breakpoint
ALTER TABLE `places` ADD `hours` text;--> statement-breakpoint
ALTER TABLE `places` ADD `visit_status` text DEFAULT 'not_visited';--> statement-breakpoint
ALTER TABLE `places` ADD `priority` integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE `places` ADD `last_visited` text;--> statement-breakpoint
ALTER TABLE `places` ADD `planned_visit` text;--> statement-breakpoint
ALTER TABLE `places` ADD `recommended_by` text;--> statement-breakpoint
ALTER TABLE `places` ADD `companions` text;--> statement-breakpoint
ALTER TABLE `places` ADD `practical_info` text;--> statement-breakpoint
CREATE INDEX `attachments_place_id_idx` ON `attachments` (`place_id`);--> statement-breakpoint
CREATE INDEX `attachments_type_idx` ON `attachments` (`type`);--> statement-breakpoint
CREATE INDEX `attachments_primary_idx` ON `attachments` (`place_id`,`is_primary`);--> statement-breakpoint
CREATE INDEX `place_links_place_id_idx` ON `place_links` (`place_id`);--> statement-breakpoint
CREATE INDEX `place_links_type_idx` ON `place_links` (`type`);--> statement-breakpoint
CREATE INDEX `place_links_platform_idx` ON `place_links` (`platform`);--> statement-breakpoint
CREATE INDEX `reservations_place_id_idx` ON `reservations` (`place_id`);--> statement-breakpoint
CREATE INDEX `reservations_date_idx` ON `reservations` (`reservation_date`);--> statement-breakpoint
CREATE INDEX `reservations_status_idx` ON `reservations` (`status`);--> statement-breakpoint
CREATE INDEX `places_visit_status_idx` ON `places` (`visit_status`);--> statement-breakpoint
CREATE INDEX `places_priority_idx` ON `places` (`priority`);--> statement-breakpoint
CREATE INDEX `places_last_visited_idx` ON `places` (`last_visited`);--> statement-breakpoint
CREATE INDEX `places_planned_visit_idx` ON `places` (`planned_visit`);