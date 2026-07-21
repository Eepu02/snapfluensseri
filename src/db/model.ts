import { eq } from "drizzle-orm";
import z from "zod";
import type { BotContext } from "../bot";
import {
	parseEveryDurationToSeconds,
	type Schedule,
	scheduleModel,
} from "../utils/schedule";
import { groupSelectModel, groups } from "./schema";

const IntervalFromDbString = z.number().int().positive();

/**
 * Coerce a DB string into a validated interval number.
 * Adds a Zod issue on `path` and returns `z.NEVER` on failure.
 */
function coerceIntervalFromDb(
	raw: string,
	ctx: z.RefinementCtx,
	path: (string | number)[] = ["scheduleValue"],
): number | null {
	const n = parseEveryDurationToSeconds(raw);

	if (!Number.isFinite(n)) {
		ctx.addIssue({
			code: "custom",
			message: "scheduleValue must be a number when scheduleType is 'interval'",
			path,
		});
		return null;
	}

	const parsed = IntervalFromDbString.safeParse(n);
	if (!parsed.success) {
		// forward the numeric validation errors (int/positive) to the right path
		for (const issue of parsed.error.issues) {
			ctx.addIssue({ ...issue, path });
		}
		return null;
	}

	return parsed.data;
}

const parsedGroupShape = groupSelectModel
	.omit({ scheduleType: true, scheduleValue: true })
	.extend({ schedule: scheduleModel });

export const parsedGroupModel = groupSelectModel
	.transform((row, ctx) => {
		const { scheduleType, scheduleValue, ...rest } = row;

		const schedule: Schedule | typeof z.NEVER =
			scheduleType === "cron"
				? ({ type: "cron", value: scheduleValue } satisfies Schedule)
				: scheduleType === "calendar"
					? (() => {
							try {
								const parsed = scheduleModel.safeParse({
									type: "calendar",
									value: JSON.parse(scheduleValue),
								});
								if (parsed.success) return parsed.data;
							} catch {
								// Report the same model issue below for malformed JSON.
							}
							ctx.addIssue({
								code: "custom",
								message: "scheduleValue must be a valid calendar schedule",
								path: ["scheduleValue"],
							});
							return z.NEVER;
						})()
					: (() => {
							const interval = coerceIntervalFromDb(scheduleValue, ctx, [
								"scheduleValue",
							]);
							if (interval == null) return z.NEVER;
							return { type: "interval", value: interval } satisfies Schedule;
						})();

		if (schedule === z.NEVER) return z.NEVER;

		return {
			...rest,
			schedule,
		};
	})
	.pipe(parsedGroupShape);

export type ParsedGroupModel = z.infer<typeof parsedGroupModel>;

export const getGroup = async ({ ctx }: { ctx: BotContext }) => {
	if (!ctx.chat?.id) throw new Error("[MODEL ERROR]: No chat ID");
	const rows = await ctx.db
		.select()
		.from(groups)
		.where(eq(groups.chatId, ctx.chat.id))
		.limit(1);

	const group = rows.at(0);

	if (!group) throw new Error("[MODEL ERROR]: Group not found");

	const parsed = parsedGroupModel.parse(group);

	return parsed;
};
