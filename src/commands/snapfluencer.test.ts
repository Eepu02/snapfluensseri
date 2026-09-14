import { beforeEach, describe, expect, it, vi } from "vitest";
import { claimRotationPicks } from "../db/rotation";
import { snapfluencer } from "./snapfluencer";

vi.mock("../db/rotation", () => ({
	claimRotationPicks: vi.fn(),
}));

const ctx = {
	chat: { id: 1, type: "group" },
	from: { id: 999 },
	db: {},
	reply: vi.fn(),
	sendMessage: vi.fn().mockResolvedValue({ message_id: 1 }),
};

describe("snapfluencer fair rotation", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("announces a member only after the rotation claim resolves", async () => {
		vi.mocked(claimRotationPicks).mockResolvedValue([
			{
				userId: 101,
				username: "bob",
				firstName: "Bob",
			} as never,
		]);

		await snapfluencer(ctx as never);

		expect(claimRotationPicks).toHaveBeenCalledWith(ctx.db, 1, 1);
		expect(ctx.sendMessage).toHaveBeenCalledWith(
			expect.stringContaining("@bob"),
			{ parse_mode: "HTML" },
		);
		expect(
			vi.mocked(claimRotationPicks).mock.invocationCallOrder[0],
		).toBeLessThan(ctx.sendMessage.mock.invocationCallOrder[0]);
	});

	it("reports an empty opted-in group", async () => {
		vi.mocked(claimRotationPicks).mockResolvedValue([]);

		await snapfluencer(ctx as never);

		expect(ctx.sendMessage).not.toHaveBeenCalled();
		expect(ctx.reply).toHaveBeenCalledWith(
			"Ei soveltuvia jäseniä. Tee /join liittyäksesi.",
		);
	});
});
