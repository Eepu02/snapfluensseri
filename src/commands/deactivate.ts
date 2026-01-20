import { eq } from "drizzle-orm";
import { groups } from "../db/schema";
import type { CommandCtx } from "./context.type";

export const deactivate = async (ctx: CommandCtx) => {
	if (!ctx.chat || ctx.chat.type === "private") {
		return await ctx.reply("This command only works in groups.");
	}

	const chatId = ctx.chat.id;
	await ctx.db
		.update(groups)
		.set({ isActive: false })
		.where(eq(groups.chatId, chatId));

	await ctx.reply("❌ Snapfluencer deactivated. Settings are preserved.");
};
