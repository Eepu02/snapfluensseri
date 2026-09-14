import { sql } from "drizzle-orm";
import {
	foreignKey,
	index,
	integer,
	primaryKey,
	sqliteTable,
	text,
} from "drizzle-orm/sqlite-core";
import { createSelectSchema } from "drizzle-zod";
import { z } from "zod";

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
		drawnThisCycle: integer("drawn_this_cycle", { mode: "boolean" })
			.notNull()
			.default(false),

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

		fkGroup: foreignKey({
			columns: [t.chatId],
			foreignColumns: [groups.chatId],
		}).onDelete("cascade"),
	}),
);

export const drawModeModel = z.enum(["random", "double"]);
export type DrawMode = z.infer<typeof drawModeModel>;

export const groupSelectModel = createSelectSchema(groups).extend({
	drawMode: drawModeModel,
	scheduleType: z.enum(["cron", "interval", "calendar"]),
	scheduleValue: z.string(),
});

export type Group = typeof groups.$inferSelect;
export type User = typeof groupMembers.$inferInsert;
