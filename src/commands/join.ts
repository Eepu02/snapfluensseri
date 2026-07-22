import { groupMembers, groups } from "../db/schema";
import { withDbRetry } from "../utils/helpers";
import type { CommandCtx } from "./context.type";

const encouragements = ["Camaa", "Lesgou", "Haippii", "It is time"];

export const join = async (ctx: CommandCtx) => {
	if (!ctx.chat || ctx.chat.type === "private") {
		return await ctx.reply("This command only works in groups.");
	}

	const chatId = ctx.chat.id;
	const userId = ctx.from.id;

	// Ensure group exists
	await withDbRetry(() =>
		ctx.db
			.insert(groups)
			.values({ chatId, isActive: false })
			.onConflictDoNothing(),
	);

	// Upsert member
	await withDbRetry(() =>
		ctx.db
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
			}),
	);

	await ctx.reply(
		`${encouragements[Math.floor(Math.random() * encouragements.length)]} ${ctx.from.first_name || ctx.from.username}, oot ines! 😎`,
	);
};
