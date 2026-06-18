import { and, eq, lte, sql } from "drizzle-orm";
import { Telegraf, TelegramError } from "telegraf";
import { type Env, getDb } from "./db/client";
import { parsedGroupModel } from "./db/model";
import { groupMembers, groups } from "./db/schema";
import { formatErrorMessage } from "./utils/helpers";
import { pickRandom } from "./utils/random";
import { getNextRunAt } from "./utils/schedule";
import { escapeHTML, formatMention } from "./utils/telegram";

/**
 * Scans the database for active groups that are due for a draw, performs the random selection,
 * sends Telegram notifications, and updates group schedules and member counts.
 * 
 * Group drawings are executed concurrently to keep execution time under Cloudflare Worker limits
 * and avoid overlapping cron trigger executions.
 * 
 * @param env - The Cloudflare Worker environment variables, including database bindings and BOT_TOKEN.
 * @param scheduledTimeMs - The scheduled cron trigger execution time in milliseconds since the Unix epoch.
 */
export async function runCron(env: Env, scheduledTimeMs: number) {
	const db = getDb(env);
	const bot = new Telegraf(env.BOT_TOKEN);
	const anchorTime = new Date(scheduledTimeMs);

	const groupsModel = parsedGroupModel.array();

	try {
		const rawGroups = await db
			.select()
			.from(groups)
			.where(and(eq(groups.isActive, true), lte(groups.nextRunAt, anchorTime)));

		const parsed = groupsModel.safeParse(rawGroups);
		if (!parsed.success) {
			console.error(
				`[MODEL PARSE ERROR]: Failed to parse groups for scheduledTime ${anchorTime.toISOString()}. Errors: ${JSON.stringify(
					parsed.error.issues,
				)}`,
			);
			return;
		}
		const dueGroups = parsed.data;
		console.log(`[Cron] Found ${dueGroups.length} due groups`);

		const promises = dueGroups.map(async (group) => {
			try {
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

				const unableToPick = async () => {
					try {
						await bot.telegram.sendMessage(
							group.chatId,
							"It was time for a draw but there were no group members to pick from :( do /join to be in the pool!",
						);
					} catch (err) {
						console.error(
							`[BOT MESSAGE ERROR]: Unable to send warning message to group ${group.chatId}: ${formatErrorMessage(err)}`,
						);
					}
					await db
						.update(groups)
						.set({
							nextRunAt: getNextRunAt(group.schedule, group.timezone, anchorTime),
						})
						.where(eq(groups.chatId, group.chatId));
				};

				if (members.length === 0) {
					await unableToPick();
					return;
				}

				// 2. Selection Logic
				const picked = pickRandom(
					members,
					group.lastPickedUserId ? [group.lastPickedUserId] : [],
				);

				if (!picked) {
					await unableToPick();
					return;
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
						return;
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
						nextRunAt: getNextRunAt(group.schedule, group.timezone, anchorTime),
					})
					.where(eq(groups.chatId, group.chatId));
			} catch (err) {
				console.error(`[Cron] Error processing group ${group.chatId}:`, err);
			}
		});

		await Promise.all(promises);
	} catch (err) {
		console.error("[Cron] Critical Error:", err);
	}
}
