ALTER TABLE `sources` ADD `processing_status` text DEFAULT 'pending';--> statement-breakpoint
ALTER TABLE `sources` ADD `processing_attempts` integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE `sources` ADD `processing_error` text;--> statement-breakpoint
ALTER TABLE `sources` ADD `processing_started_at` text;--> statement-breakpoint
CREATE INDEX `sources_processing_status_idx` ON `sources` (`processing_status`,`user_id`);