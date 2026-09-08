CREATE TABLE `transactions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`portfolio_id` integer NOT NULL,
	`instrument_id` integer,
	`type` text NOT NULL,
	`quantity` integer,
	`price_kopecks` integer,
	`amount_kopecks` integer,
	`commission_kopecks` integer DEFAULT 0 NOT NULL,
	`currency` text DEFAULT 'RUB' NOT NULL,
	`operation_date` integer NOT NULL,
	`comment` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`portfolio_id`) REFERENCES `portfolios`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`instrument_id`) REFERENCES `instruments`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
ALTER TABLE `portfolios` ADD `archived_at` integer;