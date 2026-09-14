import { claimRotationPicks } from "../db/rotation";
import { formatMention } from "../utils/telegram";
import type { CommandCtx } from "./context.type";

export const snapfluencer = async (ctx: CommandCtx) => {
	if (!ctx.chat || ctx.chat.type === "private") {
		return await ctx.reply("This command only works in groups.");
	}

	const chatId = ctx.chat.id;
	const [picked] = await claimRotationPicks(ctx.db, chatId, 1);

	if (!picked) {
		return await ctx.reply("Ei soveltuvia jäseniä. Tee /join liittyäksesi.");
	}

	const mention = formatMention(
		picked.userId,
		picked.username,
		picked.firstName,
	);
	const msgText = `🎉 ${mention} on snapfluensseri!`;

	await ctx.sendMessage(msgText, { parse_mode: "HTML" });
};
