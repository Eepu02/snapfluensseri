import { and, eq } from "drizzle-orm";
import { Telegraf } from "telegraf";
import { message } from "telegraf/filters";
import { type Env, getDb } from "./db/client";
import { groupMembers, groups } from "./db/schema";
import { formatErrorMessage, formatInTz } from "./utils/helpers";
import { pickRandom } from "./utils/random";
import {
	getNextRunAt,
	humanizeSeconds,
	parseEveryDurationToSeconds,
} from "./utils/schedule";
import { formatMention } from "./utils/telegram";

async function setupBot(env: Env) {
	const bot = new Telegraf(env.BOT_TOKEN);
	const db = getDb(env);

	/**
	 * /activate - Create or activate a group
	 */
	bot.command("activate", async (ctx) => {
		if (!ctx.chat || ctx.chat.type === "private") {
			return await ctx.reply("This command only works in groups.");
		}

		const chatId = ctx.chat.id;

		try {
			await db
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
			console.error("[BOT ERROR]: " + formatErrorMessage(e));
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
	});

	/**
	 * /deactivate - Deactivate a group
	 */
	bot.command("deactivate", async (ctx) => {
		if (!ctx.chat || ctx.chat.type === "private") {
			return await ctx.reply("This command only works in groups.");
		}

		const chatId = ctx.chat.id;
		await db
			.update(groups)
			.set({ isActive: false })
			.where(eq(groups.chatId, chatId));

		await ctx.reply("❌ Snapfluencer deactivated. Settings are preserved.");
	});

	/**
	 * /join - Opt in as a member
	 */
	bot.command("join", async (ctx) => {
		if (!ctx.chat || ctx.chat.type === "private") {
			return await ctx.reply("This command only works in groups.");
		}

		const chatId = ctx.chat.id;
		const userId = ctx.from.id;

		// Ensure group exists
		await db
			.insert(groups)
			.values({ chatId, isActive: false })
			.onConflictDoNothing();

		// Upsert member
		await db
			.insert(groupMembers)
			.values({
				chatId,
				userId,
				username: ctx.from.username,
				firstName: ctx.from.first_name,
				isOptedIn: true,
			})
			.onConflictDoUpdate({
				target: [groupMembers.chatId, groupMembers.userId],
				set: { isOptedIn: true },
			});

		await ctx.reply(
			`👋 ${ctx.from.first_name || ctx.from.username}, you're in!`,
		);
	});

	/**
	 * /leave - Opt out
	 */
	bot.command("leave", async (ctx) => {
		if (!ctx.chat || ctx.chat.type === "private") {
			return await ctx.reply("This command only works in groups.");
		}

		const chatId = ctx.chat.id;
		const userId = ctx.from.id;

		await db
			.update(groupMembers)
			.set({ isOptedIn: false })
			.where(
				and(eq(groupMembers.chatId, chatId), eq(groupMembers.userId, userId)),
			);

		await ctx.reply(
			`👋 ${ctx.from.first_name || ctx.from.username}, you're out.`,
		);
	});

	/**
	 * /schedule - Set interval or cron schedule
	 */
	bot.command("schedule", async (ctx) => {
		if (!ctx.chat || ctx.chat.type === "private") {
			return await ctx.reply("This command only works in groups.");
		}

		const chatId = ctx.chat.id;
		const args = ctx.message.text.split(/\s+/).slice(1);

		const rows = await db
			.select()
			.from(groups)
			.where(eq(groups.chatId, chatId))
			.limit(1);

		if (rows.length === 0) {
			return await ctx.reply("Group not found. Run /activate first.");
		}

		const group = rows.at(0);

		if (args.length < 2) {
			return await ctx.reply(
				"Usage:\n/schedule every X [w/d/h/m/s]\n/schedule cron 0 9 */3 * *",
			);
		}

		const type = args[0].toLowerCase();

		if (type === "every") {
			const durationText = args.slice(1).join(" "); // allow multi-word
			const seconds = parseEveryDurationToSeconds(durationText);

			if (!seconds) {
				return await ctx.reply(
					"Please provide a valid interval.\nExamples:\n" +
						"/schedule every 3 days\n" +
						"/schedule every 5 minutes\n" +
						"/schedule every 3 days 12 hours\n" +
						"/schedule every 259200",
				);
			}

			if (Number.isNaN(seconds) || seconds <= 0) {
				return await ctx.reply("Please provide a valid number of seconds.");
			}

			const nextRunAt = new Date(Date.now() + seconds * 1000);
			await db
				.update(groups)
				.set({
					scheduleType: "interval",
					scheduleValue: String(seconds),
					nextRunAt,
				})
				.where(eq(groups.chatId, chatId));

			await ctx.reply(
				`⏰ Schedule set to every ${humanizeSeconds(seconds)}. Next run at ${formatInTz(nextRunAt, group!.timezone)}.`,
			);
		} else if (type === "cron") {
			const cronExpr = args.slice(1).join(" ");
			const group = await db
				.select()
				.from(groups)
				.where(eq(groups.chatId, chatId))
				.limit(1);

			if (group.length === 0) {
				return await ctx.reply("Group not found. Run /activate first.");
			}

			try {
				const nextRunAt = getNextRunAt("cron", cronExpr, group[0].timezone);
				await db
					.update(groups)
					.set({
						scheduleType: "cron",
						scheduleValue: cronExpr,
						nextRunAt,
					})
					.where(eq(groups.chatId, chatId));
				await ctx.reply(
					`⏰ Cron schedule set to: ${cronExpr}. Next run at ${formatInTz(nextRunAt, group[0].timezone)}.`,
				);
			} catch (err) {
				await ctx.reply(`❌ Invalid cron expression: ${err}`);
			}
		} else {
			await ctx.reply(
				"Usage:\n/schedule every 3 days\n/schedule cron 0 9 */3 * *",
			);
		}
	});

	bot.command("mode", async (ctx) => {
		if (!ctx.chat || ctx.chat.type === "private") {
			return await ctx.reply("This command only works in groups.");
		}

		const chatId = ctx.chat.id;
		const args = ctx.message.text.split(/\s+/).slice(1);

		if (args.length !== 1 || !["random", "double"].includes(args[0])) {
			return await ctx.reply("Usage: /mode random|double");
		}

		const drawMode = args[0];

		await db.update(groups).set({ drawMode }).where(eq(groups.chatId, chatId));

		await ctx.reply(
			`🎲 Draw mode set to ${drawMode === "double" ? "Double Trouble (10% chance of double pick)" : "Random"}.`,
		);
	});

	/**
	 * /timezone - Set timezone for cron
	 */
	bot.command("timezone", async (ctx) => {
		if (!ctx.chat || ctx.chat.type === "private") {
			return await ctx.reply("This command only works in groups.");
		}

		const chatId = ctx.chat.id;
		const tz = ctx.message.text.split(/\s+/).slice(1).join(" ");

		if (!tz) {
			return await ctx.reply("Usage: /timezone Europe/Helsinki");
		}

		try {
			// Validate timezone by computing next run (will throw if invalid)
			const group = await db
				.select()
				.from(groups)
				.where(eq(groups.chatId, chatId))
				.limit(1);

			if (group.length > 0 && group[0].scheduleType === "cron") {
				getNextRunAt("cron", group[0].scheduleValue, tz);
			}

			await db
				.update(groups)
				.set({ timezone: tz })
				.where(eq(groups.chatId, chatId));
			await ctx.reply(`🌍 Timezone set to ${tz}`);
		} catch (err) {
			await ctx.reply(`❌ Invalid timezone: ${err}`);
		}
	});

	/**
	 * /status - Show group status
	 */
	bot.command("status", async (ctx) => {
		if (!ctx.chat || ctx.chat.type === "private") {
			return await ctx.reply("This command only works in groups.");
		}

		const chatId = ctx.chat.id;
		const group = await db
			.select()
			.from(groups)
			.where(eq(groups.chatId, chatId))
			.limit(1);

		if (group.length === 0) {
			return await ctx.reply(
				"Snapfluencer not activated. Run /activate first.",
			);
		}

		const groupData = group[0];

		// Get eligible members count
		const members = await db
			.select()
			.from(groupMembers)
			.where(
				and(eq(groupMembers.chatId, chatId), eq(groupMembers.isOptedIn, true)),
			);

		const humanizedScheduleValue =
			groupData.scheduleType === "interval"
				? humanizeSeconds(parseInt(groupData.scheduleValue, 10))
				: `${groupData.scheduleValue}s`;

		const status = groupData.isActive ? "✅ Active" : "❌ Inactive";
		const schedule =
			groupData.scheduleType === "interval"
				? `Every ${humanizedScheduleValue}`
				: `Cron: ${groupData.scheduleValue}`;
		const nextRun = groupData.nextRunAt
			? formatInTz(groupData.nextRunAt, groupData.timezone)
			: "Not scheduled";
		const eligibleCount = members.length;
		const drawMode =
			groupData.drawMode === "double" ? "Double Trouble" : "Random";

		await ctx.reply(
			`📊 Status\n\n` +
				`${status}\n` +
				`Schedule: ${schedule}\n` +
				`Timezone: ${groupData.timezone}\n` +
				`Draw Mode: ${drawMode}\n` +
				`Next draw: ${nextRun}\n` +
				`Eligible members: ${eligibleCount}`,
		);
	});

	/**
	 * /snapfluencer - Manual pick
	 */
	bot.command("snapfluencer", async (ctx) => {
		if (!ctx.chat || ctx.chat.type === "private") {
			return await ctx.reply("This command only works in groups.");
		}

		const chatId = ctx.chat.id;
		const members = await db
			.select()
			.from(groupMembers)
			.where(
				and(eq(groupMembers.chatId, chatId), eq(groupMembers.isOptedIn, true)),
			);

		if (members.length === 0) {
			return await ctx.reply("No eligible members. Use /join to join.");
		}

		const group = await db
			.select()
			.from(groups)
			.where(eq(groups.chatId, chatId))
			.limit(1);

		const lastPickedIndex = members.findIndex(
			(m) => m.userId === (group[0]?.lastPickedUserId || null),
		);

		const picked = pickRandom(
			members,
			lastPickedIndex >= 0 ? [lastPickedIndex] : undefined,
		);

		if (!picked) {
			return await ctx.reply("Could not pick a member.");
		}

		const mention = formatMention(
			picked.userId,
			picked.username,
			picked.firstName,
		);
		const msgText = `🎉 ${mention} is the new snapfluencer!`;

		await ctx.sendMessage(msgText, { parse_mode: "HTML" });

		await db
			.update(groups)
			.set({ lastPickedUserId: picked.userId })
			.where(eq(groups.chatId, chatId));
	});

	bot.start(async (ctx) => {
		await ctx.reply(`Use /help to see available commands.`);
	});

	bot.help(async (ctx) => {
		await ctx.reply(
			`Commands:\n` +
				`/activate - Activate Snapfluencer in this group\n` +
				`/deactivate - Deactivate Snapfluencer\n` +
				`/schedule every <amount> <units> - Set interval (e.g., every 3 days)\n` +
				`/schedule cron <expression> - Set cron (e.g., cron 0 9 */3 * *)\n` +
				`/timezone <tz> - Set timezone for cron (e.g., Europe/Helsinki)\n` +
				`/mode random|double - Set draw mode\n` +
				`/join - Opt in to be selected\n` +
				`/leave - Opt out\n` +
				`/status - Show current status\n` +
				`/snapfluencer - Pick now`,
		);
	});
	// Intentionally not in help menu
	bot.command("onnea", async (ctx) => {
		if (!ctx.chat || ctx.chat.type === "private") {
			return;
		}
		const chatId = ctx.chat.id;
		const rows = await db
			.select()
			.from(groups)
			.where(eq(groups.chatId, chatId))
			.limit(1);
		if (rows.length === 0) {
			console.error("Group not found for /onnea command");
			return;
		}

		const group = rows.at(0);
		const lastPicked = group!.lastPickedUserId;

		if (!lastPicked) {
			return;
		}

		const user = await db
			.select()
			.from(groupMembers)
			.where(
				and(
					eq(groupMembers.chatId, chatId),
					eq(groupMembers.userId, lastPicked),
				),
			)
			.limit(1);

		if (user.length === 0) {
			console.error("User not found for /onnea command");
			return;
		}

		await db
			.update(groupMembers)
			.set({ congratulationsCount: user.at(0)!.congratulationsCount + 1 })
			.where(eq(groupMembers.userId, lastPicked));
	});

	/**
	 * Track seen users on any message
	 */
	bot.on(message("text"), async (ctx) => {
		if (!ctx.chat || ctx.chat.type === "private" || !ctx.from) return;

		const chatId = ctx.chat.id;
		const userId = ctx.from.id;

		await db
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

let cachedBot: Telegraf<any> | null = null;

export async function getBot(env: Env) {
	if (cachedBot) return cachedBot;
	cachedBot = await setupBot(env);
	return cachedBot;
}
