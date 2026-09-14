import { beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "../utils/random";
import { claimRotationPicks } from "./rotation";

const makeUser = (userId: number, lastDrawnCycle: number): User => ({
	chatId: 1,
	userId,
	username: null,
	firstName: `User ${userId}`,
	lastSeenAt: null,
	snapCount: 0,
	congratulationsCount: 0,
	lastDrawnCycle,
	isOptedIn: true,
	createdAt: new Date(0),
	updatedAt: new Date(0),
});

const groupSelect = (
	rotationCycle: number,
	lastPickedUserId: number | null,
) => ({
	from: vi.fn().mockReturnValue({
		where: vi.fn().mockReturnValue({
			limit: vi.fn().mockResolvedValue([{ rotationCycle, lastPickedUserId }]),
		}),
	}),
});

const memberSelect = (members: User[]) => ({
	from: vi.fn().mockReturnValue({
		where: vi.fn().mockResolvedValue(members),
	}),
});

const cycleGuardSelect = () => ({
	from: vi.fn().mockReturnValue({
		where: vi.fn().mockReturnValue({}),
	}),
});

const returningUpdate = (sets: object[], result: object[]) => ({
	set: vi.fn().mockImplementation((values) => {
		sets.push(values);
		return {
			where: vi.fn().mockReturnValue({
				returning: vi.fn().mockResolvedValue(result),
			}),
		};
	}),
});

const plainUpdate = (sets: object[]) => ({
	set: vi.fn().mockImplementation((values) => {
		sets.push(values);
		return { where: vi.fn().mockResolvedValue([]) };
	}),
});

describe("claimRotationPicks", () => {
	beforeEach(() => {
		vi.spyOn(Math, "random").mockReturnValue(0);
	});

	it("atomically claims an eligible member", async () => {
		const sets: object[] = [];
		const alice = makeUser(100, 1);
		const bob = makeUser(101, 0);
		const db = {
			select: vi
				.fn()
				.mockReturnValueOnce(groupSelect(1, 100))
				.mockReturnValueOnce(memberSelect([alice, bob]))
				.mockReturnValueOnce(cycleGuardSelect()),
			update: vi
				.fn()
				.mockReturnValueOnce(returningUpdate(sets, [{ userId: 101 }]))
				.mockReturnValueOnce(plainUpdate(sets)),
		};

		const picks = await claimRotationPicks(db as never, 1, 1);

		expect(picks).toEqual([bob]);
		expect(sets).toContainEqual({ lastDrawnCycle: 1 });
		expect(sets).toContainEqual({ lastPickedUserId: 101 });
	});

	it("advances the cycle with compare-and-set and avoids an immediate repeat", async () => {
		const sets: object[] = [];
		const alice = makeUser(100, 0);
		const bob = makeUser(101, 0);
		const db = {
			select: vi
				.fn()
				.mockReturnValueOnce(groupSelect(0, 100))
				.mockReturnValueOnce(memberSelect([alice, bob]))
				.mockReturnValueOnce(cycleGuardSelect()),
			update: vi
				.fn()
				.mockReturnValueOnce(returningUpdate(sets, [{ rotationCycle: 1 }]))
				.mockReturnValueOnce(returningUpdate(sets, [{ userId: 101 }]))
				.mockReturnValueOnce(plainUpdate(sets)),
		};

		const picks = await claimRotationPicks(db as never, 1, 1);

		expect(picks).toEqual([bob]);
		expect(sets).toContainEqual({ lastDrawnCycle: 1 });
	});

	it("retries when another draw claims the same member first", async () => {
		const sets: object[] = [];
		const alice = makeUser(100, 1);
		const bobBeforeConflict = makeUser(101, 0);
		const bobAfterConflict = makeUser(101, 1);
		const charlie = makeUser(102, 0);
		const db = {
			select: vi
				.fn()
				.mockReturnValueOnce(groupSelect(1, 100))
				.mockReturnValueOnce(memberSelect([alice, bobBeforeConflict, charlie]))
				.mockReturnValueOnce(cycleGuardSelect())
				.mockReturnValueOnce(groupSelect(1, 101))
				.mockReturnValueOnce(memberSelect([alice, bobAfterConflict, charlie]))
				.mockReturnValueOnce(cycleGuardSelect()),
			update: vi
				.fn()
				.mockReturnValueOnce(returningUpdate(sets, []))
				.mockReturnValueOnce(returningUpdate(sets, [{ userId: 102 }]))
				.mockReturnValueOnce(plainUpdate(sets)),
		};

		const picks = await claimRotationPicks(db as never, 1, 1);

		expect(picks).toEqual([charlie]);
		expect(db.update).toHaveBeenCalledTimes(3);
	});

	it("lets a new member join the current cycle immediately", async () => {
		const sets: object[] = [];
		const alice = makeUser(100, 4);
		const bob = makeUser(101, 4);
		const newcomer = makeUser(102, 0);
		const db = {
			select: vi
				.fn()
				.mockReturnValueOnce(groupSelect(4, 101))
				.mockReturnValueOnce(memberSelect([alice, bob, newcomer]))
				.mockReturnValueOnce(cycleGuardSelect()),
			update: vi
				.fn()
				.mockReturnValueOnce(returningUpdate(sets, [{ userId: 102 }]))
				.mockReturnValueOnce(plainUpdate(sets)),
		};

		const picks = await claimRotationPicks(db as never, 1, 1);

		expect(picks).toEqual([newcomer]);
		expect(sets).toContainEqual({ lastDrawnCycle: 4 });
	});

	it("crosses a cycle boundary during a double draw without duplicates", async () => {
		const sets: object[] = [];
		const alice = makeUser(100, 1);
		const bob = makeUser(101, 1);
		const charlieBeforePick = makeUser(102, 0);
		const charlieAfterPick = makeUser(102, 1);
		const db = {
			select: vi
				.fn()
				.mockReturnValueOnce(groupSelect(1, 101))
				.mockReturnValueOnce(memberSelect([alice, bob, charlieBeforePick]))
				.mockReturnValueOnce(cycleGuardSelect())
				.mockReturnValueOnce(groupSelect(1, 102))
				.mockReturnValueOnce(memberSelect([alice, bob, charlieAfterPick]))
				.mockReturnValueOnce(cycleGuardSelect()),
			update: vi
				.fn()
				.mockReturnValueOnce(returningUpdate(sets, [{ userId: 102 }]))
				.mockReturnValueOnce(plainUpdate(sets))
				.mockReturnValueOnce(returningUpdate(sets, [{ rotationCycle: 2 }]))
				.mockReturnValueOnce(returningUpdate(sets, [{ userId: 100 }]))
				.mockReturnValueOnce(plainUpdate(sets)),
		};

		const picks = await claimRotationPicks(db as never, 1, 2);

		expect(picks).toEqual([charlieBeforePick, alice]);
		expect(new Set(picks.map((pick) => pick.userId)).size).toBe(2);
		expect(sets).toContainEqual({ lastDrawnCycle: 1 });
		expect(sets).toContainEqual({ lastDrawnCycle: 2 });
	});
});
