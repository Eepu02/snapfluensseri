import { type Context, Telegraf } from "telegraf";
import { message } from "telegraf/filters";
import { activate } from "./commands/activate";
import { deactivate } from "./commands/deactivate";
import { join } from "./commands/join";
import { leave } from "./commands/leave";
import { mode } from "./commands/mode";
import { onnea } from "./commands/onnea";
import { schedule } from "./commands/schedule";
import { snapfluencer } from "./commands/snapfluencer";
import { status } from "./commands/status";
import { timezone } from "./commands/timezone";
import { type DB, type Env, getDb } from "./db/client";
import { groupMembers } from "./db/schema";
import { commandList } from "./utils/commandList";

export interface BotContext extends Context {
	db: DB;
}

async function setupBot(env: Env) {
	const bot = new Telegraf<BotContext>(env.BOT_TOKEN);

	bot.use(async (ctx, next) => {
		ctx.db = getDb(env);
		await next(); // runs next middleware
	});

	// Debugging middleware to log incoming updates
	bot.use(async (ctx, next) => {
		console.log(`[UPDATE RECEIVED]: ${JSON.stringify(ctx.update)}`);
		await next();
	});

	/**
	 * /activate - Create or activate a group
	 */
	bot.command("activate", activate);

	/**
	 * /deactivate - Deactivate a group
	 */
	bot.command("deactivate", deactivate);

	/**
	 * /join - Opt in as a member
	 */
	bot.command("join", join);

	/**
	 * /leave - Opt out
	 */
	bot.command("leave", leave);

	/**
	 * /schedule - Set interval or cron schedule
	 */
	bot.command("schedule", schedule);

	bot.command("mode", mode);

	/**
	 * /timezone - Set timezone for cron
	 */
	bot.command("timezone", timezone);

	/**
	 * /status - Show group status
	 */
	bot.command("status", status);

	/**
	 * /snapfluencer - Manual pick
	 */
	bot.command("snapfluencer", snapfluencer);

	bot.start(async (ctx) => {
		await ctx.reply(`Use /help to see available commands.`);
	});

	bot.help(async (ctx) => {
		await ctx.reply(commandList);
	});
	// Intentionally not in help menu
	bot.command("onnea", onnea);

	/**
	 * Track seen users on any message
	 */
	bot.on(message("text"), async (ctx) => {
		if (!ctx.chat || ctx.chat.type === "private" || !ctx.from) return;

		const chatId = ctx.chat.id;
		const userId = ctx.from.id;

		await ctx.db
			.insert(groupMembers)
			.values({
				chatId,
				userId,
				username: ctx.from.username,
				firstName: ctx.from.first_name,
				isOptedIn: true,
				lastSeenAt: new Date(),
			})
			.onConflictDoUpdate({
				target: [groupMembers.chatId, groupMembers.userId],
				set: { lastSeenAt: new Date() },
			});
	});

	return bot;
}

let cachedBot: Telegraf<BotContext> | null = null;

export async function getBot(env: Env) {
	if (cachedBot) return cachedBot;
	cachedBot = await setupBot(env);
	return cachedBot;
}
