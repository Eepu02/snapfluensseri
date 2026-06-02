import { and, eq } from "drizzle-orm";
import { groupMembers, groups } from "../db/schema";
import { pickRandom } from "../utils/random";
import { formatMention } from "../utils/telegram";
import type { CommandCtx } from "./context.type";

export const snapfluencer = async (ctx: CommandCtx) => {
	if (!ctx.chat || ctx.chat.type === "private") {
		return await ctx.reply("This command only works in groups.");
	}

	const chatId = ctx.chat.id;
	const members = await ctx.db
		.select()
		.from(groupMembers)
		.where(
			and(eq(groupMembers.chatId, chatId), eq(groupMembers.isOptedIn, true)),
		);

	if (members.length === 0) {
		return await ctx.reply("Ei soveltuvia jäseniä. Tee /join liittyäksesi.");
	}

	const group = await ctx.db
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
		return await ctx.reply("Ei onnannu.");
	}

	const mention = formatMention(
		picked.userId,
		picked.username,
		picked.firstName,
	);
	const msgText = `🎉 ${mention} on snapfluensseri!`;

	await ctx.sendMessage(msgText, { parse_mode: "HTML" });

	await ctx.db
		.update(groups)
		.set({ lastPickedUserId: picked.userId })
		.where(eq(groups.chatId, chatId));
};
