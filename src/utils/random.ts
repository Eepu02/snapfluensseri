/**
 * Pick a random element from an array, optionally excluding one.
 */
export function pickRandom<T>(items: T[], excludeIndexes?: number[]): T | null {
	const filtered =
		excludeIndexes !== undefined
			? items.filter((_, i) => !excludeIndexes.includes(i))
			: items;

	if (filtered.length === 0) return null;
	return filtered[Math.floor(Math.random() * filtered.length)];
}
