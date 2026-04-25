ALTER TABLE `dismissed_duplicates` ADD `user_id` text REFERENCES users(id);--> statement-breakpoint
CREATE INDEX `dismissed_duplicates_user_idx` ON `dismissed_duplicates` (`user_id`);--> statement-breakpoint
CREATE INDEX `dismissed_duplicates_user_pair_idx` ON `dismissed_duplicates` (`user_id`,`place_id_1`,`place_id_2`);--> statement-breakpoint
UPDATE `dismissed_duplicates`
SET `user_id` = (
  SELECT `places`.`user_id`
  FROM `places`
  WHERE `places`.`id` = `dismissed_duplicates`.`place_id_1`
    AND `places`.`user_id` IS NOT NULL
  LIMIT 1
)
WHERE `user_id` IS NULL;
