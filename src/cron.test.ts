import { TelegramError } from "telegraf";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { runCron } from "./cron"; // Adjust this path to your cron file
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
			constructor(code: number) {
				super();
				this.code = code;
				this.name = "TelegramError";
			}
		} as any,
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
	delete: vi.fn().mockReturnThis(),
};

describe("runCron Integration Tests", () => {
	const mockEnv = { BOT_TOKEN: "fake_token" } as any;
	const scheduledTime = new Date("2024-01-01T12:00:00Z").getTime();

	beforeEach(() => {
		vi.clearAllMocks();
		vi.restoreAllMocks();
		vi.spyOn(dbClient, "getDb").mockReturnValue(mockDb as any);
	});

	it("should perform a standard draw excluding the last winner", async () => {
		// GIVEN: A group with 3 members. Alice was the last winner.
		const mockGroup = {
			chatId: 123,
			scheduleValue: "0 12 * * *",
			timezone: "UTC",
			lastPickedUserId: 123,
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
	});

	it("should trigger 'Double Trouble' when the 10% roll succeeds", async () => {
		// GIVEN: 3 members
		const mockGroup = {
			chatId: 456,
			scheduleValue: "0 12 * * *",
			timezone: "UTC",
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
			scheduleValue: "0 12 * * *",
			timezone: "UTC",
			lastPickedUserId: 100,
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
			{ chatId: 999, scheduleValue: "* * * * *" },
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
			scheduleValue: "0 12 * * *",
			timezone: "UTC",
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
});
