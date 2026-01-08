import { CronExpressionParser } from "cron-parser";
import { and, eq, lte } from "drizzle-orm";
import { Telegraf, TelegramError } from "telegraf";
import { type Env, getDb } from "../db/client";
import { groupMembers, groups } from "../db/schema";
import { pickRandom } from "./random";
import { getNextRunAt } from "./schedule";
import { formatMention } from "./telegram";

export function computeNextRunAt(
	cronExpr: string,
	timezone: string,
	from: Date = new Date(),
): Date {
	// Telegram users will usually provide 5-field cron: "m h dom mon dow"
	// cron-parser supports that.
	const it = CronExpressionParser.parse(cronExpr, {
		currentDate: from,
		tz: timezone,
	});
	return it.next().toDate();
}

export async function runCron(env: Env, scheduledTimeMs: number) {
	const db = getDb(env);
	const bot = new Telegraf(env.BOT_TOKEN);

	try {
		// Fetch due groups
		const now = new Date(scheduledTimeMs);
		const dueGroups = await db
			.select()
			.from(groups)
			.where(and(eq(groups.isActive, true), lte(groups.nextRunAt, now)));

		console.log(`[Cron] Found ${dueGroups.length} due groups`);

		for (const group of dueGroups) {
			// Get eligible members
			const members = await db
				.select()
				.from(groupMembers)
				.where(
					and(
						eq(groupMembers.chatId, group.chatId),
						eq(groupMembers.isOptedIn, true),
					),
				);

			if (members.length === 0) {
				// No eligible members, just advance nextRunAt
				const nextRunAt = getNextRunAt(
					group.scheduleType as "interval" | "cron",
					group.scheduleValue,
					group.timezone,
				);
				await db
					.update(groups)
					.set({ nextRunAt })
					.where(eq(groups.chatId, group.chatId));
				console.log(
					`[Cron] Group ${group.chatId}: no members, advanced schedule`,
				);
				continue;
			}

			// Pick a random member, excluding last picked unless only one member
			const lastPickedIndex = members.findIndex(
				(m) => m.userId === group.lastPickedUserId,
			);
			const picked =
				members.length > 1
					? pickRandom(
							members,
							lastPickedIndex >= 0 ? [lastPickedIndex] : undefined,
						)
					: members.at(0);
			let secondPick = null;
			if (Math.random() < 0.1) {
				// 10% chance for double pick
				secondPick =
					members.length > 2
						? pickRandom(members, [
								...(lastPickedIndex >= 0 ? [lastPickedIndex] : []),
								...(picked ? [members.indexOf(picked)] : []),
							])
						: members.find((m) => m.userId !== picked?.userId) || null;
			}

			if (!picked) {
				const nextRunAt = getNextRunAt(
					group.scheduleType as "interval" | "cron",
					group.scheduleValue,
					group.timezone,
				);
				await db
					.update(groups)
					.set({ nextRunAt })
					.where(eq(groups.chatId, group.chatId));
				console.log(
					`[Cron] Group ${group.chatId}: could not pick, advanced schedule`,
				);
				continue;
			}

			// Send message
			const mention = formatMention(
				picked.userId,
				picked.username,
				picked.firstName,
			);

			const secondMention = secondPick
				? formatMention(
						secondPick.userId,
						secondPick.username,
						secondPick.firstName,
					)
				: null;

			const titles = [
				"👻 Snapfluencer",
				"🔥 Main Character",
				"👑 Content Overlord",
				"💅 Aesthetic Manager",
				"😎 Vibe Director",
				"🎬 Storyteller Supreme",
				"🌟 Social Media Star",
				"📱 Digital Diva",
				"🎉 Trendsetter",
				"🚀 Engagement Guru",
				"🎯 Influencer Pro",
				"🎨 Creative Visionary",
				"📷 Photo Phenom",
				"💡 Idea Machine",
				"🌈 Mood Booster",
				"✨ Highlight Hero",
				"💥 Viral Sensation",
			];

			const title = titles[Math.floor(Math.random() * titles.length)];

			let msgText = "";
			if (secondPick) {
				msgText = `Double Trouble! New ${title}s are ${mention} and ${secondMention}!`;
			} else {
				msgText = `New ${title} is ${mention}!`;
			}

			try {
				await bot.telegram.sendMessage(group.chatId, msgText, {
					parse_mode: "HTML",
				});
			} catch (err) {
				console.error(
					`[Cron] Error sending message to group ${group.chatId}:`,
					err,
				);
				if (err instanceof TelegramError) {
					if (err.code === 403) {
						// Bot was removed from the group, delete the group
						await db.delete(groups).where(eq(groups.chatId, group.chatId));
						console.log(
							`[Cron] Bot removed from group ${group.chatId}, deleted group from database`,
						);
						continue;
					}
				}
			}

			// Advance schedule
			const nextRunAt = getNextRunAt(
				group.scheduleType as "interval" | "cron",
				group.scheduleValue,
				group.timezone,
			);

			await db
				.update(groupMembers)
				.set({
					snapCount: picked.snapCount + 1,
				})
				.where(
					and(
						eq(groupMembers.chatId, group.chatId),
						eq(groupMembers.userId, picked.userId),
					),
				);

			if (secondPick) {
				await db
					.update(groupMembers)
					.set({
						snapCount: secondPick.snapCount + 1,
					})
					.where(
						and(
							eq(groupMembers.chatId, group.chatId),
							eq(groupMembers.userId, secondPick.userId),
						),
					);
			}

			await db
				.update(groups)
				.set({
					lastPickedUserId: picked.userId,
					nextRunAt,
				})
				.where(eq(groups.chatId, group.chatId));

			console.log(
				`[Cron] Group ${group.chatId}: picked user ${picked.userId}, next run at ${nextRunAt}`,
			);
		}
	} catch (err) {
		console.error("[Cron] Error:", err);
	}
}
