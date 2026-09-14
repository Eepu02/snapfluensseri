import type { groupMembers } from "../db/schema";

export type User = typeof groupMembers.$inferSelect;

export type RotationSelection = {
	picks: User[];
	resetCycle: boolean;
	drawnUserIds: User["userId"][];
};

/**
 * Robust random picker that excludes specific IDs.
 */
export function pickRandom(
	candidates: User[],
	excludeIds: User["userId"][] = [],
): User | null {
	const eligible = candidates.filter(
		(user) => !excludeIds.includes(user.userId),
	);

	// Fallback: If everyone is excluded but we have items, pick from original list
	// (Prevents the bot from failing if a group is too small for the cooldown)
	const pool = eligible.length > 0 ? eligible : candidates;

	if (pool.length === 0) return null;
	return pool[Math.floor(Math.random() * pool.length)];
}

/**
 * Picks members without replacement until every member has been drawn.
 *
 * A selection can cross a cycle boundary (for example, a Double Trouble
 * draw). At a boundary, the previous pick is excluded when possible so that
 * the same member is not picked back-to-back.
 */
export function pickRotation(
	candidates: User[],
	pickCount = 1,
	lastPickedUserId: User["userId"] | null = null,
): RotationSelection {
	const picks: User[] = [];
	const pickedUserIds = new Set<User["userId"]>();
	const drawnUserIds = new Set(
		candidates
			.filter((candidate) => candidate.drawnThisCycle)
			.map((candidate) => candidate.userId),
	);
	let resetCycle = false;
	let previousPickId = lastPickedUserId;

	while (picks.length < pickCount && picks.length < candidates.length) {
		let eligible = candidates.filter(
			(candidate) =>
				!drawnUserIds.has(candidate.userId) &&
				!pickedUserIds.has(candidate.userId),
		);

		if (eligible.length === 0) {
			drawnUserIds.clear();
			resetCycle = true;
			eligible = candidates.filter(
				(candidate) =>
					candidate.userId !== previousPickId &&
					!pickedUserIds.has(candidate.userId),
			);

			// A one-person group cannot honor the no-immediate-repeat rule.
			if (eligible.length === 0) {
				eligible = candidates.filter(
					(candidate) => !pickedUserIds.has(candidate.userId),
				);
			}
		}

		const picked = pickRandom(eligible);
		if (!picked) break;

		picks.push(picked);
		pickedUserIds.add(picked.userId);
		drawnUserIds.add(picked.userId);
		previousPickId = picked.userId;
	}

	return {
		picks,
		resetCycle,
		drawnUserIds: [...drawnUserIds],
	};
}
