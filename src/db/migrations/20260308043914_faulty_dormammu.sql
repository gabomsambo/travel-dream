CREATE INDEX `attachments_created_at_idx` ON `attachments` (`created_at`);--> statement-breakpoint
CREATE INDEX `attachments_type_place_id_idx` ON `attachments` (`type`,`place_id`);