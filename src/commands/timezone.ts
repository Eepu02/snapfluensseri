import { eq } from "drizzle-orm";
import { getGroup } from "../db/model";
import { groups } from "../db/schema";
import { validateSchedule } from "../utils/schedule";
import type { CommandCtx } from "./context.type";

export const timezone = async (ctx: CommandCtx) => {
	if (!ctx.chat || ctx.chat.type === "private") {
		return await ctx.reply("This command only works in groups.");
	}

	const chatId = ctx.chat.id;
	const tz = ctx.message.text.split(/\s+/).slice(1).join(" ");

	if (!tz) {
		return await ctx.reply("Usage: /timezone Europe/Helsinki");
	}

	const group = await getGroup({ ctx });

	const validationResult = validateSchedule(group.schedule, tz);

	if (!validationResult) {
		return await ctx.reply("The timezone is not valid!");
	}

	await ctx.db
		.update(groups)
		.set({ timezone: tz })
		.where(eq(groups.chatId, chatId));
	return await ctx.reply(`🌍 Timezone set to ${tz}`);
};
