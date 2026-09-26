ALTER TABLE `entries` ADD `scheduled_at` text;--> statement-breakpoint
ALTER TABLE `entries` ADD `schedule_listed` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `entries` ADD `preview_open` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `entries` ADD `schedule_meta` text DEFAULT '{"title":true,"author":true,"categories":true}' NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_entries_schedule` ON `entries` (`kind`,`deleted`,`scheduled_at`);