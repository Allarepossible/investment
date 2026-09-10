ALTER TABLE `instruments` ADD `logo_path` text;--> statement-breakpoint
ALTER TABLE `instruments` ADD `logo_status` text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE `instruments` ADD `logo_source` text;