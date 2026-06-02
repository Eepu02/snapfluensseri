import { groups } from "../db/schema";
import { commandList } from "../utils/commandList";
import { formatErrorMessage } from "../utils/helpers";
import type { CommandCtx } from "./context.type";

export const activate = async (ctx: CommandCtx) => {
	if (!ctx.chat || ctx.chat.type === "private") {
		return await ctx.reply("This command only works in groups.");
	}

	const chatId = ctx.chat.id;

	try {
		await ctx.db
			.insert(groups)
			.values({
				chatId,
				isActive: true,
				scheduleType: "interval",
				scheduleValue: "259200", // 3 days
				timezone: "UTC",
				nextRunAt: new Date(Date.now() + 259200 * 1000),
			})
			.onConflictDoUpdate({
				target: groups.chatId,
				set: { isActive: true },
			});
	} catch (e) {
		console.error(`[BOT ERROR]: ${formatErrorMessage(e)}`);
	}

	await ctx.reply(
		`Snapfluensseri! Mennään!\n\n` + commandList,
	);
};
