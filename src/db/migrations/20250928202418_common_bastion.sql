ALTER TABLE `sources` ADD `llm_processed` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `sources` ADD `llm_processed_at` text;--> statement-breakpoint
ALTER TABLE `sources` ADD `llm_model` text;--> statement-breakpoint
ALTER TABLE `sources` ADD `llm_confidence` real;--> statement-breakpoint
ALTER TABLE `sources` ADD `llm_extraction_details` text;--> statement-breakpoint
CREATE INDEX `sources_llm_processed_idx` ON `sources` (`llm_processed`);--> statement-breakpoint
CREATE INDEX `sources_llm_confidence_idx` ON `sources` (`llm_confidence`);