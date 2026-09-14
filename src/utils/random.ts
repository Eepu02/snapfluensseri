import type { groupMembers } from "../db/schema";

export type User = typeof groupMembers.$inferSelect;

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
