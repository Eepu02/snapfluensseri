import { and, eq } from "drizzle-orm";
import { getGroup, type ParsedGroupModel } from "../db/model";
import { groupMembers } from "../db/schema";
import { formatInTz } from "../utils/helpers";
import { humanizeSeconds } from "../utils/schedule";
import type { CommandCtx } from "./context.type";

export const status = async (ctx: CommandCtx) => {
	if (!ctx.chat || ctx.chat.type === "private") {
		return await ctx.reply("This command only works in groups.");
	}

	const chatId = ctx.chat.id;
	const group = await getGroup({ ctx });

	// Get eligible members count
	const members = await ctx.db
		.select()
		.from(groupMembers)
		.where(
			and(eq(groupMembers.chatId, chatId), eq(groupMembers.isOptedIn, true)),
		);

	const getNextRun = (group: ParsedGroupModel) => {
		if (!group.nextRunAt) return "Not scheduled";

		const fmtResult = formatInTz(group.nextRunAt, group.timezone);

		if (!fmtResult.success) return null;

		return fmtResult.time;
	};

	const humanizedScheduleValue =
		group.schedule.type === "interval"
			? humanizeSeconds(group.schedule.value)
			: `${group.schedule.value}s`;

	const status = group.isActive ? "✅ Päällä" : "❌ Pois päältä";
	const schedule =
		group.schedule.type === "interval"
			? `Every ${humanizedScheduleValue}`
			: `Cron: ${group.schedule.value}`;
	const nextRun = getNextRun(group);
	const eligibleCount = members.length;

	const drawMode = group.drawMode === "double" ? "Double Trouble" : "Random";

	const lines = [
		`${status}`,
		`Aikataulu: ${schedule}`,
		`Aikavyöhyke: ${group.timezone}`,
		`Arvonta: ${drawMode}`,
		nextRun && `Seuraava arvonta: ${nextRun}`,
		`Jäsenten määrä: ${eligibleCount}`,
	].filter(Boolean);

	await ctx.reply(`📊 Status\n\n${lines.join("\n")}`);
};
