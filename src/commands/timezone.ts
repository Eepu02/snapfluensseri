import { eq } from "drizzle-orm";
import { getGroup } from "../db/model";
import { groups } from "../db/schema";
import {
	getInitialRunAt,
	isValidTimezone,
	rebaseScheduleTimezone,
	validateSchedule,
} from "../utils/schedule";
import type { CommandCtx } from "./context.type";

export const timezone = async (ctx: CommandCtx) => {
	if (!ctx.chat || ctx.chat.type === "private") {
		return await ctx.reply("This command only works in groups.");
	}

	const chatId = ctx.chat.id;
	const tz = ctx.message.text.split(/\s+/).slice(1).join(" ");

	if (!tz) {
		return await ctx.reply("Käyttö: /timezone Europe/Helsinki");
	}

	const group = await getGroup({ ctx });

	const validationResult =
		isValidTimezone(tz) && validateSchedule(group.schedule, tz);

	if (!validationResult) {
		return await ctx.reply("Aikavyöhyke ei ole kunnollinen perhana smh");
	}

	const now = new Date();
	const nextRunAt = group.nextRunAt
		? rebaseScheduleTimezone(
				group.schedule,
				group.timezone,
				tz,
				group.nextRunAt,
				now,
			)
		: getInitialRunAt(group.schedule, tz, now);

	await ctx.db
		.update(groups)
		.set({ timezone: tz, nextRunAt })
		.where(eq(groups.chatId, chatId));
	return await ctx.reply(`🌍 Aikavyöhyke asetettu ${tz}`);
};
