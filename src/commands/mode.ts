import { eq } from "drizzle-orm";
import { groups } from "../db/schema";
import type { CommandCtx } from "./context.type";

export const mode = async (ctx: CommandCtx) => {
	if (!ctx.chat || ctx.chat.type === "private") {
		return await ctx.reply("This command only works in groups.");
	}

	const chatId = ctx.chat.id;
	const args = ctx.message.text.split(/\s+/).slice(1);

	if (args.length !== 1 || !["random", "double"].includes(args[0])) {
		return await ctx.reply("Usage: /mode random|double");
	}

	const drawMode = args[0];

	await ctx.db
		.update(groups)
		.set({ drawMode })
		.where(eq(groups.chatId, chatId));

	await ctx.reply(
		`🎲 Draw mode set to ${drawMode === "double" ? "Double Trouble (10% chance of double pick)" : "Random"}.`,
	);
};
