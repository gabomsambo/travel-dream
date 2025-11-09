ALTER TABLE `collections` ADD `transport_mode` text DEFAULT 'drive' NOT NULL;--> statement-breakpoint
ALTER TABLE `places_to_collections` ADD `is_pinned` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `places_to_collections` ADD `note` text;--> statement-breakpoint
CREATE INDEX `places_to_collections_pinned_idx` ON `places_to_collections` (`collection_id`,`is_pinned`);
