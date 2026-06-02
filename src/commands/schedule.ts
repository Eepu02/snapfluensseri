import { eq } from "drizzle-orm";
import { getGroup } from "../db/model";
import { groups } from "../db/schema";
import { formatInTz } from "../utils/helpers";
import {
	getNextRunAt,
	humanizeSchedule,
	parseEveryDurationToSeconds,
	type Schedule,
	validateSchedule,
} from "../utils/schedule";
import type { CommandCtx } from "./context.type";

export const schedule = async (ctx: CommandCtx) => {
	if (!ctx.chat || ctx.chat.type === "private") {
		return await ctx.reply("This command only works in groups.");
	}

	const chatId = ctx.chat.id;
	const args = ctx.message.text.split(/\s+/).slice(1);

	if (args.length < 2) {
		return await ctx.reply(
			"Käyttö:\n/schedule every X [w/d/h/m/s]\n/schedule cron 0 9 */3 * *",
		);
	}

	const type = args[0].toLowerCase();

	if (type !== "cron" && type !== "every") {
		return await ctx.reply(
			"Käyttö:\n/schedule every X [w/d/h/m/s]\n/schedule cron 0 9 */3 * *",
		);
	}

	const scheduleValue = args.slice(1).join(" "); // allow multi-word

	const schedule: Schedule =
		type === "every"
			? {
					type: "interval" as const,
					value: parseEveryDurationToSeconds(scheduleValue),
				}
			: {
					type: "cron" as const,
					value: scheduleValue,
				};

	const group = await getGroup({ ctx });
	const validateResult = validateSchedule(schedule, group.timezone);

	if (!validateResult) {
		return await ctx.reply(
			"Annan kunnon intervalli tai cron.\nEsim:\n" +
				"/schedule every 3 days\n" +
				"/schedule every 5 minutes\n" +
				"/schedule every 3 days 12 hours\n" +
				"/schedule cron 0 9 */3 * *",
		);
	}

	const nextRunAt = getNextRunAt(schedule, group.timezone);

	await ctx.db
		.update(groups)
		.set({
			scheduleType: schedule.type,
			scheduleValue: String(schedule.value),
			nextRunAt,
		})
		.where(eq(groups.chatId, chatId));

	const fmtResult = formatInTz(nextRunAt, group.timezone);

	if (!fmtResult.success) {
		return await ctx.reply("Aikataulu asetettu mutta aikavyöhyke on virheellinen!");
	} else {
		return await ctx.reply(
			`⏰ Aikataulu asetettu ${humanizeSchedule(schedule)}. Seuraava arvonta klo ${fmtResult.time}.`,
		);
	}
};
