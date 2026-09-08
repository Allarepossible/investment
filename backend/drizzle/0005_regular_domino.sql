ALTER TABLE `transactions` ADD `accrued_interest_kopecks` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `transactions` ADD `source_id` text;--> statement-breakpoint
CREATE UNIQUE INDEX `transactions_source_id_unique` ON `transactions` (`source_id`);