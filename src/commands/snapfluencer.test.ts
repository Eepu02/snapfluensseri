import { beforeEach, describe, expect, it, vi } from "vitest";
import { snapfluencer } from "./snapfluencer";

const mockSet = vi.fn();
const mockUpdateWhere = vi.fn().mockResolvedValue([]);

const makeDb = (members: object[], lastPickedUserId: number | null) => {
	const select = vi
		.fn()
		.mockReturnValueOnce({
			from: vi.fn().mockReturnValue({
				where: vi.fn().mockResolvedValue(members),
			}),
		})
		.mockReturnValueOnce({
			from: vi.fn().mockReturnValue({
				where: vi.fn().mockReturnValue({
					limit: vi.fn().mockResolvedValue([{ lastPickedUserId }]),
				}),
			}),
		});

	mockSet.mockReturnValue({ where: mockUpdateWhere });

	return {
		select,
		update: vi.fn().mockReturnValue({ set: mockSet }),
	};
};

const makeCtx = (db: ReturnType<typeof makeDb>) => ({
	chat: { id: 1, type: "group" },
	from: { id: 999 },
	db,
	reply: vi.fn(),
	sendMessage: vi.fn().mockResolvedValue({ message_id: 1 }),
});

describe("snapfluencer fair rotation", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.spyOn(Math, "random").mockReturnValue(0);
	});

	it("picks and marks an undrawn member", async () => {
		const db = makeDb(
			[
				{
					userId: 100,
					username: "alice",
					firstName: "Alice",
					drawnThisCycle: true,
				},
				{
					userId: 101,
					username: "bob",
					firstName: "Bob",
					drawnThisCycle: false,
				},
			],
			100,
		);
		const ctx = makeCtx(db);

		await snapfluencer(ctx as never);

		expect(ctx.sendMessage).toHaveBeenCalledWith(
			expect.stringContaining("@bob"),
			{ parse_mode: "HTML" },
		);
		expect(mockSet).toHaveBeenCalledWith({ drawnThisCycle: true });
		expect(mockSet).toHaveBeenCalledWith({ lastPickedUserId: 101 });
	});

	it("resets the cycle while keeping the new winner marked", async () => {
		const db = makeDb(
			[
				{
					userId: 100,
					username: "alice",
					firstName: "Alice",
					drawnThisCycle: true,
				},
				{
					userId: 101,
					username: "bob",
					firstName: "Bob",
					drawnThisCycle: true,
				},
			],
			100,
		);
		const ctx = makeCtx(db);

		await snapfluencer(ctx as never);

		expect(ctx.sendMessage).toHaveBeenCalledWith(
			expect.stringContaining("@bob"),
			{ parse_mode: "HTML" },
		);
		expect(mockSet).toHaveBeenCalledWith({ drawnThisCycle: false });
		expect(mockSet).not.toHaveBeenCalledWith({ drawnThisCycle: true });
		expect(mockSet).toHaveBeenCalledWith({ lastPickedUserId: 101 });
	});
});
