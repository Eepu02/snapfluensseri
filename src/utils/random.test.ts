import { beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "./random";
import { pickRandom, pickRotation } from "./random";

describe("Draw Logic: pickRandom and Multi-Pick", () => {
	const makeUser = (userId: number, firstName: string): User => ({
		chatId: 1,
		userId,
		username: null,
		firstName,
		lastSeenAt: null,
		snapCount: 0,
		congratulationsCount: 0,
		drawnThisCycle: false,
		isOptedIn: true,
		createdAt: new Date(0),
		updatedAt: new Date(0),
	});
	const userA = makeUser(100, "Alice");
	const userB = makeUser(101, "Bob");
	const userC = makeUser(102, "Charlie");

	beforeEach(() => {
		vi.spyOn(Math, "random").mockReturnValue(0.5); // Predictable middle-of-the-road pick
	});

	describe("Group Size: 1", () => {
		it("should pick the only member even if they were the last picked (Fallback)", () => {
			const candidates = [userA];
			const lastPickedId = 100;

			const picked = pickRandom(candidates, [lastPickedId]);

			// Fallback logic should trigger because eligible list is empty
			expect(picked).toEqual(userA);
		});
	});

	describe("Group Size: 2", () => {
		it("should strictly pick the user who wasn't picked last", () => {
			const candidates = [userA, userB];
			const lastPickedId = 100;

			const picked = pickRandom(candidates, [lastPickedId]);
			expect(picked?.userId).toBe(101);
		});

		it("should allow a Double Trouble pick even if it violates cooldown (Fallback)", () => {
			// Setup: A was last picked. B is current primary pick.
			// For the second pick, both A and B are excluded.
			const candidates = [userA, userB];
			const lastPickedId = 100;
			const currentPick = userB;

			const secondPick = pickRandom(candidates, [
				currentPick.userId,
				lastPickedId,
			]);

			// Should fallback to the original list and pick someone (A or B)
			expect(secondPick).not.toBeNull();
			expect(candidates).toContainEqual(secondPick);
		});
	});

	describe("Group Size: 3+", () => {
		it("should exclude both current winner and last winner from Double Trouble", () => {
			const candidates = [userA, userB, userC];
			const lastPickedId = 100;
			const currentPick = userB;

			// In a group of 3, if A was last and B is current, C MUST be the second pick.
			const secondPick = pickRandom(candidates, [
				currentPick.userId,
				lastPickedId,
			]);

			expect(secondPick?.userId).toBe(102);
		});
	});

	describe("Empty Candidates", () => {
		it("should return null gracefully", () => {
			expect(pickRandom([], [100])).toBeNull();
		});
	});
});

describe("Draw Logic: pickRotation", () => {
	const makeUser = (userId: number, drawnThisCycle = false): User => ({
		chatId: 1,
		userId,
		username: null,
		firstName: `User ${userId}`,
		lastSeenAt: null,
		snapCount: 0,
		congratulationsCount: 0,
		drawnThisCycle,
		isOptedIn: true,
		createdAt: new Date(0),
		updatedAt: new Date(0),
	});

	beforeEach(() => {
		vi.spyOn(Math, "random").mockReturnValue(0);
	});

	it("only picks members who have not been drawn in the current cycle", () => {
		const selection = pickRotation([
			makeUser(100, true),
			makeUser(101),
			makeUser(102),
		]);

		expect(selection.picks.map((user) => user.userId)).toEqual([101]);
		expect(selection.resetCycle).toBe(false);
		expect(selection.drawnUserIds).toEqual([100, 101]);
	});

	it("starts a new cycle and excludes the previous winner", () => {
		const selection = pickRotation(
			[makeUser(100, true), makeUser(101, true), makeUser(102, true)],
			1,
			100,
		);

		expect(selection.picks.map((user) => user.userId)).toEqual([101]);
		expect(selection.resetCycle).toBe(true);
		expect(selection.drawnUserIds).toEqual([101]);
	});

	it("allows the only member to be picked at every cycle boundary", () => {
		const selection = pickRotation([makeUser(100, true)], 1, 100);

		expect(selection.picks.map((user) => user.userId)).toEqual([100]);
		expect(selection.resetCycle).toBe(true);
	});

	it("carries a double draw across a cycle boundary without duplicate picks", () => {
		const selection = pickRotation(
			[makeUser(100, true), makeUser(101, true), makeUser(102)],
			2,
			101,
		);

		expect(selection.picks.map((user) => user.userId)).toEqual([102, 100]);
		expect(selection.resetCycle).toBe(true);
		expect(selection.drawnUserIds).toEqual([100]);
	});

	it("returns no picks for an empty group", () => {
		expect(pickRotation([])).toEqual({
			picks: [],
			resetCycle: false,
			drawnUserIds: [],
		});
	});
});
