import { and, eq, lte, sql } from "drizzle-orm";
import { Telegraf, TelegramError } from "telegraf";
import { type Env, getDb } from "./db/client";
import { parsedGroupModel } from "./db/model";
import { claimRotationPicks } from "./db/rotation";
import { groupMembers, groups } from "./db/schema";
import { formatErrorMessage, withDbRetry } from "./utils/helpers";
import { getNextFutureRunAt } from "./utils/schedule";
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
				if (!group.nextRunAt) return;
				const previousRunAt = group.nextRunAt;
				const members = await db
					.select()
					.from(groupMembers)
					.where(
						and(
							eq(groupMembers.chatId, group.chatId),
							eq(groupMembers.isOptedIn, true),
						),
					);

				// Move the stored cadence cursor before external work. The conditional
				// update is an atomic claim, so overlapping cron executions and stale
				// schedule snapshots cannot process the same occurrence twice.
				const nextRunAt = getNextFutureRunAt(
					group.schedule,
					group.timezone,
					previousRunAt,
					anchorTime,
				);
				const claimed = await withDbRetry(() =>
					db
						.update(groups)
						.set({ nextRunAt })
						.where(
							and(
								eq(groups.chatId, group.chatId),
								eq(groups.isActive, true),
								eq(groups.nextRunAt, previousRunAt),
							),
						)
						.returning({ chatId: groups.chatId }),
				);
				if (claimed.length === 0) return;

				// The successful claim has already advanced the schedule. This is
				// intentional even when no eligible member can be picked below.
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
				};

				if (members.length === 0) {
					await unableToPick();
					return;
				}

				// 2. Selection Logic
				const doubleDraw = group.drawMode === "double";
				const roll = Math.random() < 0.1;
				const [picked, secondPick = null] = await claimRotationPicks(
					db,
					group.chatId,
					doubleDraw && roll && members.length > 1 ? 2 : 1,
				);

				if (!picked) {
					await unableToPick();
					return;
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
						await withDbRetry(() =>
							db.delete(groups).where(eq(groups.chatId, group.chatId)),
						);
						return;
					}
					console.error(`[Cron] Send failed for ${group.chatId}:`, err);
				}

				// 5. Atomic Updates
				// Increment snapCount directly in SQL to avoid race conditions
				const increment = (uid: number) =>
					withDbRetry(() =>
						db
							.update(groupMembers)
							.set({ snapCount: sql`${groupMembers.snapCount} + 1` })
							.where(
								and(
									eq(groupMembers.chatId, group.chatId),
									eq(groupMembers.userId, uid),
								),
							),
					);

				await increment(picked.userId);
				if (secondPick) await increment(secondPick.userId);
			} catch (err) {
				console.error(`[Cron] Error processing group ${group.chatId}:`, err);
			}
		});

		await Promise.all(promises);
	} catch (err) {
		console.error("[Cron] Critical Error:", err);
	}
}
