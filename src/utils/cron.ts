import { CronExpressionParser } from "cron-parser";
import { and, eq, lte, sql } from "drizzle-orm";
import { Telegraf, TelegramError } from "telegraf";
import { type Env, getDb } from "../db/client";
import { groupMembers, groups } from "../db/schema";
import { pickRandom } from "./random";
import { escapeHTML, formatMention } from "./telegram";

export function computeNextCronRunAt(
	cronExpr: string,
	timezone: string,
	from: Date,
): Date {
	const it = CronExpressionParser.parse(cronExpr, {
		currentDate: from,
		tz: timezone,
	});
	return it.next().toDate();
}

export async function runCron(env: Env, scheduledTimeMs: number) {
	const db = getDb(env);
	const bot = new Telegraf(env.BOT_TOKEN);
	const anchorTime = new Date(scheduledTimeMs);

	try {
		const dueGroups = await db
			.select()
			.from(groups)
			.where(and(eq(groups.isActive, true), lte(groups.nextRunAt, anchorTime)));

		console.log(`[Cron] Found ${dueGroups.length} due groups`);

		for (const group of dueGroups) {
			// 1. Get eligible members
			const members = await db
				.select()
				.from(groupMembers)
				.where(
					and(
						eq(groupMembers.chatId, group.chatId),
						eq(groupMembers.isOptedIn, true),
					),
				);

			// Helper to calculate next run using the anchor time to prevent drift
			const getNextSchedule = () =>
				computeNextCronRunAt(group.scheduleValue, group.timezone, anchorTime);

			if (members.length === 0) {
				await db
					.update(groups)
					.set({ nextRunAt: getNextSchedule() })
					.where(eq(groups.chatId, group.chatId));
				continue;
			}

			// 2. Selection Logic
			const picked = pickRandom(
				members,
				group.lastPickedUserId ? [group.lastPickedUserId] : [],
			);

			if (!picked) {
				await db
					.update(groups)
					.set({ nextRunAt: getNextSchedule() })
					.where(eq(groups.chatId, group.chatId));
				continue;
			}

			let secondPick = null;
			const doubleDraw = group.drawMode === "double";
			const roll = Math.random() < 0.1;
			if (doubleDraw && roll && members.length > 1) {
				// Exclude both the current primary pick AND the previous run's winner
				secondPick = pickRandom(
					members,
					[picked.userId, group.lastPickedUserId].filter((u) => u !== null),
				);
			}

			// 3. Prepare Message (with HTML escaping)
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

			const mention1 = formatMention(
				picked.userId,
				escapeHTML(picked.username ?? undefined),
				escapeHTML(picked.firstName ?? undefined),
			);

			const msgText = secondPick
				? `Double Trouble! New ${title}s are ${mention1} and ${formatMention(secondPick.userId, escapeHTML(secondPick.username ?? undefined), escapeHTML(secondPick.firstName ?? undefined))}!`
				: `New ${title} is ${mention1}!`;

			// 4. Send Message with Error Handling
			try {
				await bot.telegram.sendMessage(group.chatId, msgText, {
					parse_mode: "HTML",
				});
			} catch (err) {
				if (err instanceof TelegramError && err.code === 403) {
					await db.delete(groups).where(eq(groups.chatId, group.chatId));
					continue;
				}
				console.error(`[Cron] Send failed for ${group.chatId}:`, err);
			}

			// 5. Atomic Updates
			// Increment snapCount directly in SQL to avoid race conditions
			const increment = (uid: number) =>
				db
					.update(groupMembers)
					.set({ snapCount: sql`${groupMembers.snapCount} + 1` })
					.where(
						and(
							eq(groupMembers.chatId, group.chatId),
							eq(groupMembers.userId, uid),
						),
					);

			await increment(picked.userId);
			if (secondPick) await increment(secondPick.userId);

			// Update group state (using anchorTime to calculate next run)
			await db
				.update(groups)
				.set({
					lastPickedUserId: picked.userId,
					nextRunAt: getNextSchedule(),
				})
				.where(eq(groups.chatId, group.chatId));
		}
	} catch (err) {
		console.error("[Cron] Critical Error:", err);
	}
}
