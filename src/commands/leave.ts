import { and, eq } from "drizzle-orm";
import { groupMembers } from "../db/schema";
import type { CommandCtx } from "./context.type";

export const leave = async (ctx: CommandCtx) => {
	if (!ctx.chat || ctx.chat.type === "private") {
		return await ctx.reply("This command only works in groups.");
	}

	const chatId = ctx.chat.id;
	const userId = ctx.from.id;

	await ctx.db
		.update(groupMembers)
		.set({ isOptedIn: false })
		.where(
			and(eq(groupMembers.chatId, chatId), eq(groupMembers.userId, userId)),
		);

	await ctx.reply(
		`Bruh ${ctx.from.first_name || ctx.from.username}, ei sit🗿 `,
	);
};
