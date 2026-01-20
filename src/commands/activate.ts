import { groups } from "../db/schema";
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
		`✅ Snapfluencer activated!\n\n` +
			`Commands:\n` +
			`/schedule every <seconds> - Set interval (e.g., every 259200 for 3 days)\n` +
			`/schedule cron <expression> - Set cron (e.g., cron 0 9 */3 * *)\n` +
			`/timezone <tz> - Set timezone for cron (e.g., Europe/Helsinki)\n` +
			`/join - Opt in to be selected\n` +
			`/leave - Opt out\n` +
			`/status - Show current status\n` +
			`/snapfluencer - Pick now`,
	);
};
