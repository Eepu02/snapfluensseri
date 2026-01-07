import { sql } from "drizzle-orm";
import {
	index,
	integer,
	primaryKey,
	sqliteTable,
	text,
} from "drizzle-orm/sqlite-core";

export const groups = sqliteTable("groups", {
	chatId: integer("chat_id").primaryKey().notNull(),
	isActive: integer("is_active", { mode: "boolean" }).notNull().default(false),
	scheduleType: text("schedule_type").notNull().default("interval"),
	scheduleValue: text("schedule_value").notNull().default("259200"),
	timezone: text("timezone").notNull().default("UTC"),
	nextRunAt: integer("next_run_at", { mode: "timestamp" }),
	lastPickedUserId: integer("last_picked_user_id"),
	drawMode: text("draw_mode").notNull().default("random"),

	createdAt: integer("created_at", { mode: "timestamp" })
		.notNull()
		.default(sql`(unixepoch())`),

	updatedAt: integer("updated_at", { mode: "timestamp" })
		.notNull()
		.default(sql`(unixepoch())`),
});

export const groupMembers = sqliteTable(
	"group_members",
	{
		chatId: integer("chat_id").notNull(),
		userId: integer("user_id").notNull(),
		username: text("username"),
		firstName: text("first_name"),
		lastSeenAt: integer("last_seen_at", { mode: "timestamp" }),
		snapCount: integer("snap_count").notNull().default(0),
		congratulationsCount: integer("congratulations_count").notNull().default(0),

		isOptedIn: integer("is_opted_in", { mode: "boolean" })
			.notNull()
			.default(true),

		createdAt: integer("created_at", { mode: "timestamp" })
			.notNull()
			.default(sql`(unixepoch())`),

		updatedAt: integer("updated_at", { mode: "timestamp" })
			.notNull()
			.default(sql`(unixepoch())`),
	},
	(t) => ({
		pk: primaryKey({ columns: [t.chatId, t.userId] }),
		idxChatOpted: index("idx_group_members_chat_opted").on(
			t.chatId,
			t.isOptedIn,
		),
	}),
);
