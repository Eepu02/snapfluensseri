import { TelegramError } from "telegraf";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { runCron } from "./cron"; // Adjust this path to your cron file
import type { Env } from "./db/client";
import * as dbClient from "./db/client";

// 1. Mock Telegraf
// Variables used in vi.mock must be prefixed with 'mock'
const mockSendMessage = vi.fn().mockResolvedValue({ message_id: 123 });

vi.mock("telegraf", () => {
	return {
		Telegraf: class {
			telegram = {
				sendMessage: mockSendMessage,
			};
		},
		TelegramError: class extends Error {
			code: number;
			constructor(
				payload: number | { description?: string; error_code?: number },
			) {
				super(
					typeof payload === "number"
						? "Telegram Error"
						: payload.description || "Telegram Error",
				);
				this.code =
					typeof payload === "number" ? payload : (payload.error_code ?? 500);
				this.name = "TelegramError";
			}
		},
	};
});

// 2. Mock Drizzle Database
// We create a "chainable" mock to handle db.select().from().where()
const mockDb = {
	select: vi.fn().mockReturnThis(),
	from: vi.fn().mockReturnThis(),
	where: vi.fn().mockReturnThis(),
	update: vi.fn().mockReturnThis(),
	set: vi.fn().mockReturnThis(),
	returning: vi.fn().mockResolvedValue([{ chatId: 1 }]),
	delete: vi.fn().mockReturnThis(),
};

describe("runCron Integration Tests", () => {
	const mockEnv = { BOT_TOKEN: "fake_token" } as Env;
	const scheduledTime = new Date("2024-01-01T12:00:00Z").getTime();

	beforeEach(() => {
		vi.clearAllMocks();
		vi.restoreAllMocks();
		vi.spyOn(dbClient, "getDb").mockReturnValue(
			mockDb as unknown as ReturnType<typeof dbClient.getDb>,
		);
	});

	it("should perform a standard draw excluding the last winner", async () => {
		// GIVEN: A group with 3 members. Alice was the last winner.
		const mockGroup = {
			chatId: 123,
			isActive: true,
			scheduleType: "cron" as const,
			scheduleValue: "0 12 * * *",
			timezone: "UTC",
			nextRunAt: new Date(scheduledTime),
			lastPickedUserId: 123,
			drawMode: "random" as const,
			createdAt: new Date(),
			updatedAt: new Date(),
		};
		const mockMembers = [
			{ userId: 123, firstName: "Alice", username: "ali" },
			{ userId: 456, firstName: "Bob", username: "bob" },
			{ userId: 789, firstName: "Charlie", username: "char" },
		];

		mockDb.where.mockResolvedValueOnce([mockGroup]); // Result for dueGroups
		mockDb.where.mockResolvedValueOnce(mockMembers); // Result for members

		// Force Math.random to skip Double Trouble (> 0.1)
		vi.spyOn(Math, "random").mockReturnValue(0.5);

		// WHEN: Cron runs
		await runCron(mockEnv, scheduledTime);

		// THEN: Bob or Charlie should be picked (since Alice is excluded)
		const messageText = mockSendMessage.mock.calls[0][1];
		// 1. Ensure Alice (the previous winner) is excluded
		expect(messageText.toLowerCase()).not.toContain("alice");

		// 2. Ensure either Bob or Charlie was picked (case-insensitive)
		// We check for both firstName and username to be safe
		expect(messageText).toMatch(/bob|char/i);

		// Verify snapCount update was triggered
		expect(mockDb.update).toHaveBeenCalled();
		expect(mockDb.set).toHaveBeenCalledWith({ drawnThisCycle: true });
	});

	it("resets the rotation after every member has been drawn", async () => {
		const mockGroup = {
			chatId: 124,
			isActive: true,
			scheduleType: "cron" as const,
			scheduleValue: "0 12 * * *",
			timezone: "UTC",
			nextRunAt: new Date(scheduledTime),
			lastPickedUserId: 100,
			drawMode: "random" as const,
			createdAt: new Date(),
			updatedAt: new Date(),
		};
		const mockMembers = [
			{ userId: 100, firstName: "Alice", drawnThisCycle: true },
			{ userId: 101, firstName: "Bob", drawnThisCycle: true },
			{ userId: 102, firstName: "Charlie", drawnThisCycle: true },
		];

		mockDb.where.mockResolvedValueOnce([mockGroup]);
		mockDb.where.mockResolvedValueOnce(mockMembers);
		vi.spyOn(Math, "random").mockReturnValue(0);

		await runCron(mockEnv, scheduledTime);

		expect(mockSendMessage.mock.calls[0][1]).toContain("Bob");
		expect(mockDb.set).toHaveBeenCalledWith({ drawnThisCycle: false });
		expect(mockDb.set).not.toHaveBeenCalledWith({ drawnThisCycle: true });
	});

	it("should not process a due group when another worker already claimed it", async () => {
		const mockGroup = {
			chatId: 321,
			isActive: true,
			scheduleType: "interval" as const,
			scheduleValue: "3600",
			timezone: "UTC",
			nextRunAt: new Date(scheduledTime),
			lastPickedUserId: null,
			drawMode: "random" as const,
			createdAt: new Date(),
			updatedAt: new Date(),
		};

		mockDb.where.mockResolvedValueOnce([mockGroup]);
		mockDb.where.mockResolvedValueOnce([{ userId: 100, firstName: "Alice" }]);
		mockDb.returning.mockResolvedValueOnce([]);

		await runCron(mockEnv, scheduledTime);

		expect(mockSendMessage).not.toHaveBeenCalled();
		expect(mockDb.set).toHaveBeenCalledWith({
			nextRunAt: new Date("2024-01-01T13:00:00Z"),
		});
	});

	it("should trigger 'Double Trouble' when the 10% roll succeeds", async () => {
		// GIVEN: 3 members
		const mockGroup = {
			chatId: 456,
			isActive: true,
			scheduleType: "cron" as const,
			scheduleValue: "0 12 * * *",
			timezone: "UTC",
			nextRunAt: new Date(scheduledTime),
			lastPickedUserId: null,
			drawMode: "double" as const,
			createdAt: new Date(),
			updatedAt: new Date(),
		};
		const mockMembers = [
			{ userId: 100, firstName: "Alice" },
			{ userId: 101, firstName: "Bob" },
			{ userId: 102, firstName: "Charlie" },
		];

		mockDb.where.mockResolvedValueOnce([mockGroup]);
		mockDb.where.mockResolvedValueOnce(mockMembers);

		// Force Double Trouble (0.05 < 0.1)
		vi.spyOn(Math, "random").mockReturnValue(0.05);

		await runCron(mockEnv, scheduledTime);

		// THEN: Message should contain "Double Trouble" and mention two users
		const messageText = mockSendMessage.mock.calls[0][1];
		expect(messageText).toContain("Double Trouble!");
		expect(messageText).toContain("and");
	});

	it("should use fallback logic if group size is 1 (even if excluded)", async () => {
		// GIVEN: Only Alice is in the group, and she was the last winner
		const mockGroup = {
			chatId: 789,
			isActive: true,
			scheduleType: "cron" as const,
			scheduleValue: "0 12 * * *",
			timezone: "UTC",
			nextRunAt: new Date(scheduledTime),
			lastPickedUserId: 100,
			drawMode: "random" as const,
			createdAt: new Date(),
			updatedAt: new Date(),
		};
		const mockMembers = [{ userId: 100, firstName: "Alice" }];

		mockDb.where.mockResolvedValueOnce([mockGroup]);
		mockDb.where.mockResolvedValueOnce(mockMembers);

		await runCron(mockEnv, scheduledTime);

		// THEN: Alice should be picked again because of the pickRandom fallback
		expect(mockSendMessage).toHaveBeenCalledWith(
			789,
			expect.stringContaining("Alice"),
			expect.anything(),
		);
	});

	it("should delete the group from DB if the bot was kicked (403 Error)", async () => {
		// GIVEN: Telegram returns 403 Forbidden
		mockDb.where.mockResolvedValueOnce([
			{
				chatId: 999,
				isActive: true,
				scheduleType: "cron" as const,
				scheduleValue: "* * * * *",
				timezone: "UTC",
				nextRunAt: new Date(scheduledTime),
				lastPickedUserId: null,
				drawMode: "random" as const,
				createdAt: new Date(),
				updatedAt: new Date(),
			},
		]);
		mockDb.where.mockResolvedValueOnce([{ userId: 100, firstName: "Alice" }]);

		mockSendMessage.mockRejectedValueOnce(
			new TelegramError({ error_code: 403, description: "Forbidden" }),
		);

		await runCron(mockEnv, scheduledTime);

		// THEN: The group should be deleted from the database
		expect(mockDb.delete).toHaveBeenCalled();
	});

	it("should properly escape HTML in usernames to prevent crashes", async () => {
		// GIVEN: A user with HTML characters in their name
		const mockGroup = {
			chatId: 111,
			isActive: true,
			scheduleType: "cron" as const,
			scheduleValue: "0 12 * * *",
			timezone: "UTC",
			nextRunAt: new Date(scheduledTime),
			lastPickedUserId: null,
			drawMode: "random" as const,
			createdAt: new Date(),
			updatedAt: new Date(),
		};
		const mockMembers = [
			{ userId: 100, firstName: "<b>Malicious</b>", username: "evil&co" },
		];

		mockDb.where.mockResolvedValueOnce([mockGroup]);
		mockDb.where.mockResolvedValueOnce(mockMembers);

		await runCron(mockEnv, scheduledTime);

		// THEN: The characters should be escaped
		const messageText = mockSendMessage.mock.calls[0][1];
		expect(messageText).toContain("evil&amp;co");
		// firstName "<b>Malicious</b>" -> "&lt;b&gt;Malicious&lt;/b&gt;"
		// expect(messageText).toContain("&lt;b&gt;Malicious&lt;/b&gt;");

		// Ensure raw HTML tags are NOT present
		expect(messageText).not.toContain("<b>");
	});

	it("should process multiple due groups in parallel", async () => {
		// GIVEN: Two active due groups
		const groupA = {
			chatId: 111,
			isActive: true,
			scheduleType: "cron" as const,
			scheduleValue: "0 12 * * *",
			timezone: "UTC",
			nextRunAt: new Date(scheduledTime),
			lastPickedUserId: null,
			drawMode: "random" as const,
			createdAt: new Date(),
			updatedAt: new Date(),
		};
		const groupB = {
			chatId: 222,
			isActive: true,
			scheduleType: "cron" as const,
			scheduleValue: "0 12 * * *",
			timezone: "UTC",
			nextRunAt: new Date(scheduledTime),
			lastPickedUserId: null,
			drawMode: "random" as const,
			createdAt: new Date(),
			updatedAt: new Date(),
		};
		const mockMembers = [{ userId: 100, firstName: "Alice" }];

		mockDb.where.mockResolvedValueOnce([groupA, groupB]); // For dueGroups select
		mockDb.where.mockResolvedValueOnce(mockMembers);
		mockDb.where.mockResolvedValueOnce(mockMembers);

		// WHEN: Cron runs
		await runCron(mockEnv, scheduledTime);

		// THEN: Both groups should have been processed (two sendMessage calls)
		expect(mockSendMessage).toHaveBeenCalledTimes(2);
		expect(mockSendMessage).toHaveBeenNthCalledWith(
			1,
			111,
			expect.any(String),
			expect.any(Object),
		);
		expect(mockSendMessage).toHaveBeenNthCalledWith(
			2,
			222,
			expect.any(String),
			expect.any(Object),
		);
	});

	it("should isolate processing errors so that one failed group does not affect others", async () => {
		// GIVEN: Two active due groups
		const groupA = {
			chatId: 111,
			isActive: true,
			scheduleType: "cron" as const,
			scheduleValue: "0 12 * * *",
			timezone: "UTC",
			nextRunAt: new Date(scheduledTime),
			lastPickedUserId: null,
			drawMode: "random" as const,
			createdAt: new Date(),
			updatedAt: new Date(),
		};
		const groupB = {
			chatId: 222,
			isActive: true,
			scheduleType: "cron" as const,
			scheduleValue: "0 12 * * *",
			timezone: "UTC",
			nextRunAt: new Date(scheduledTime),
			lastPickedUserId: null,
			drawMode: "random" as const,
			createdAt: new Date(),
			updatedAt: new Date(),
		};
		const mockMembers = [{ userId: 100, firstName: "Bob" }];

		// Mock the query execution sequentially:
		// 1. Select dueGroups -> returns [groupA, groupB]
		// 2. Select members for groupA -> throws an error!
		// 3. Select members for groupB -> returns mockMembers
		let callCount = 0;
		mockDb.where.mockImplementation(() => {
			callCount++;
			if (callCount === 1) {
				return Promise.resolve([groupA, groupB]);
			}
			if (callCount === 2) {
				return Promise.reject(
					new Error("Simulated D1 database failure for Group A"),
				);
			}
			if (callCount === 3) return Promise.resolve(mockMembers);
			return mockDb;
		});

		// WHEN: Cron runs
		await runCron(mockEnv, scheduledTime);

		// THEN: Group B should still be processed successfully
		expect(mockSendMessage).toHaveBeenCalledTimes(1);
		expect(mockSendMessage).toHaveBeenCalledWith(
			222,
			expect.stringContaining("Bob"),
			expect.any(Object),
		);
	});
});
