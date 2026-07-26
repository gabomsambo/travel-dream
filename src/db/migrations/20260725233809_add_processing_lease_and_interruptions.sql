ALTER TABLE `sources` ADD `processing_interruptions` integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE `sources` ADD `processing_lease_id` text;