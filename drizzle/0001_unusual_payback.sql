ALTER TABLE `group_members` ADD `last_drawn_cycle` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `groups` ADD `rotation_cycle` integer DEFAULT 0 NOT NULL;
