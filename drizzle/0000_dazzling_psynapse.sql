PRAGMA foreign_keys = ON;

CREATE TABLE `group_members` (
	`chat_id` integer NOT NULL,
	`user_id` integer NOT NULL,
	`username` text,
	`first_name` text,
	`last_seen_at` integer,
	`snap_count` integer DEFAULT 0 NOT NULL,
	`congratulations_count` integer DEFAULT 0 NOT NULL,
	`is_opted_in` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	PRIMARY KEY(`chat_id`, `user_id`),
	FOREIGN KEY (`chat_id`) REFERENCES `groups`(`chat_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_group_members_chat_opted` ON `group_members` (`chat_id`,`is_opted_in`);--> statement-breakpoint
CREATE TABLE `groups` (
	`chat_id` integer PRIMARY KEY NOT NULL,
	`is_active` integer DEFAULT false NOT NULL,
	`schedule_type` text DEFAULT 'interval' NOT NULL,
	`schedule_value` text DEFAULT '259200' NOT NULL,
	`timezone` text DEFAULT 'UTC' NOT NULL,
	`next_run_at` integer,
	`last_picked_user_id` integer,
	`draw_mode` text DEFAULT 'random' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
