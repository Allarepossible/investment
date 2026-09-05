CREATE TABLE `instruments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ticker` text NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`exchange` text DEFAULT 'MOEX' NOT NULL,
	`board` text,
	`currency` text DEFAULT 'RUB' NOT NULL,
	`lot_size` integer,
	`min_price_step` real,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
