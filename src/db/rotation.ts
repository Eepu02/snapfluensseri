import { and, eq, exists, lt, sql } from "drizzle-orm";
import { withDbRetry } from "../utils/helpers";
import { pickRandom, type User } from "../utils/random";
import type { DB } from "./client";
import { groupMembers, groups } from "./schema";

const MAX_CLAIM_ATTEMPTS = 25;

/**
 * Atomically claims members from a group's fair rotation before they are
 * announced. Concurrent callers may claim different members, but the
 * compare-and-set updates prevent either caller from losing the other's state.
 */
export async function claimRotationPicks(
	db: DB,
	chatId: number,
	pickCount: number,
): Promise<User[]> {
	const picks: User[] = [];
	const pickedUserIds = new Set<number>();
	let previousPickId: number | null = null;

	for (let attempt = 0; attempt < MAX_CLAIM_ATTEMPTS; attempt++) {
		const [groupRows, members] = await Promise.all([
			db
				.select({
					rotationCycle: groups.rotationCycle,
					lastPickedUserId: groups.lastPickedUserId,
				})
				.from(groups)
				.where(eq(groups.chatId, chatId))
				.limit(1),
			db
				.select()
				.from(groupMembers)
				.where(
					and(
						eq(groupMembers.chatId, chatId),
						eq(groupMembers.isOptedIn, true),
					),
				),
		]);

		const group = groupRows[0];
		if (!group || members.length === 0) {
			if (picks.length === 0) return [];
			throw new Error("Rotation changed before all winners could be claimed");
		}

		const targetCount = Math.min(pickCount, members.length);
		if (picks.length >= targetCount) return picks;

		let cycle = group.rotationCycle;
		let eligible = members.filter(
			(member) =>
				member.lastDrawnCycle < cycle && !pickedUserIds.has(member.userId),
		);
		let startedNewCycle = false;

		if (eligible.length === 0) {
			const advanced = await withDbRetry(() =>
				db
					.update(groups)
					.set({ rotationCycle: sql`${groups.rotationCycle} + 1` })
					.where(
						and(eq(groups.chatId, chatId), eq(groups.rotationCycle, cycle)),
					)
					.returning({ rotationCycle: groups.rotationCycle }),
			);

			if (advanced.length === 0) continue;

			cycle = advanced[0].rotationCycle;
			startedNewCycle = true;
			eligible = members.filter(
				(member) =>
					member.lastDrawnCycle < cycle && !pickedUserIds.has(member.userId),
			);
		}

		const excludedId = startedNewCycle
			? (previousPickId ?? group.lastPickedUserId)
			: null;
		const withoutImmediateRepeat = eligible.filter(
			(member) => member.userId !== excludedId,
		);
		const candidate = pickRandom(
			withoutImmediateRepeat.length > 0 ? withoutImmediateRepeat : eligible,
		);
		if (!candidate) continue;

		const cycleIsCurrent = db
			.select({ chatId: groups.chatId })
			.from(groups)
			.where(and(eq(groups.chatId, chatId), eq(groups.rotationCycle, cycle)));
		const claimed = await withDbRetry(() =>
			db
				.update(groupMembers)
				.set({ lastDrawnCycle: cycle })
				.where(
					and(
						eq(groupMembers.chatId, chatId),
						eq(groupMembers.userId, candidate.userId),
						eq(groupMembers.isOptedIn, true),
						lt(groupMembers.lastDrawnCycle, cycle),
						exists(cycleIsCurrent),
					),
				)
				.returning({ userId: groupMembers.userId }),
		);

		if (claimed.length === 0) continue;

		picks.push(candidate);
		pickedUserIds.add(candidate.userId);
		previousPickId = candidate.userId;

		await withDbRetry(() =>
			db
				.update(groups)
				.set({ lastPickedUserId: candidate.userId })
				.where(and(eq(groups.chatId, chatId), eq(groups.rotationCycle, cycle))),
		);

		if (picks.length >= targetCount) return picks;
	}

	throw new Error(
		"Unable to claim fair-rotation winners after repeated conflicts",
	);
}
