ALTER TABLE `attachments` ADD `source` text DEFAULT 'upload' NOT NULL;--> statement-breakpoint
ALTER TABLE `attachments` ADD `source_id` text;--> statement-breakpoint
ALTER TABLE `attachments` ADD `attribution` text;--> statement-breakpoint
CREATE INDEX `attachments_source_idx` ON `attachments` (`source`);--> statement-breakpoint
CREATE INDEX `attachments_source_place_idx` ON `attachments` (`place_id`,`source`);