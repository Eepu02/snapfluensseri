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
		return await ctx.reply("Käyttö: /mode random|double");
	}

	const drawMode = args[0];

	await ctx.db
		.update(groups)
		.set({ drawMode })
		.where(eq(groups.chatId, chatId));

	await ctx.reply(
		`🎲 Arvonnan tila on nyt ${drawMode === "double" ? "Double Trouble (10% tsäänssi tupla-arpaan)" : "Random"}.`,
	);
};
