import { and, eq, sql } from "drizzle-orm";
import { getGroup } from "../db/model";
import { groupMembers } from "../db/schema";
import type { CommandCtx } from "./context.type";

export const onnea = async (ctx: CommandCtx) => {
	if (!ctx.chat || ctx.chat.type === "private") {
		return;
	}
	const chatId = ctx.chat.id;
	const group = await getGroup({ ctx });
	const lastPicked = group.lastPickedUserId;

	if (!lastPicked) {
		return;
	}

	const user = await ctx.db
		.select()
		.from(groupMembers)
		.where(
			and(eq(groupMembers.chatId, chatId), eq(groupMembers.userId, lastPicked)),
		)
		.limit(1);

	if (user.length === 0) {
		console.error("User not found for /onnea command");
		return;
	}

	await ctx.db
		.update(groupMembers)
		.set({
			congratulationsCount: sql`${groupMembers.congratulationsCount} + 1`,
		})
		.where(
			and(eq(groupMembers.chatId, chatId), eq(groupMembers.userId, lastPicked)),
		);
};
