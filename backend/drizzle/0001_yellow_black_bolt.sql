ALTER TABLE `instruments` ADD `market` text;--> statement-breakpoint
CREATE UNIQUE INDEX `instruments_ticker_unique` ON `instruments` (`ticker`);