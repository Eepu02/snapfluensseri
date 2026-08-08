import { and, eq, type SQL } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getGroup } from "../db/model";
import { groupMembers } from "../db/schema";
import type { CommandCtx } from "./context.type";
import { onnea } from "./onnea";

vi.mock("../db/model", () => ({ getGroup: vi.fn() }));

describe("onnea", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("atomically increments only the selected member in the current group", async () => {
		vi.mocked(getGroup).mockResolvedValue({ lastPickedUserId: 456 } as never);

		const selectLimit = vi.fn().mockResolvedValue([
			{
				chatId: 123,
				userId: 456,
				congratulationsCount: 2,
			},
		]);
		const selectWhere = vi.fn().mockReturnValue({ limit: selectLimit });
		const selectFrom = vi.fn().mockReturnValue({ where: selectWhere });
		const updateWhere = vi.fn().mockResolvedValue(undefined);
		const updateSet = vi.fn().mockReturnValue({ where: updateWhere });

		const ctx = {
			chat: { id: 123, type: "group" },
			db: {
				select: vi.fn().mockReturnValue({ from: selectFrom }),
				update: vi.fn().mockReturnValue({ set: updateSet }),
			},
		} as unknown as CommandCtx;

		await onnea(ctx);

		expect(updateWhere).toHaveBeenCalledWith(
			and(eq(groupMembers.chatId, 123), eq(groupMembers.userId, 456)),
		);
		const increment = updateSet.mock.calls[0]?.[0].congratulationsCount as SQL;
		expect(increment.queryChunks).toContain(groupMembers.congratulationsCount);
	});
});
