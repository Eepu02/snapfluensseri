import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "./db/client";

const telegramMocks = vi.hoisted(() => ({
	setMyDescription: vi.fn(),
}));

vi.mock("telegraf", () => ({
	Telegraf: class {
		telegram = telegramMocks;
		use = vi.fn();
		command = vi.fn();
		start = vi.fn();
		help = vi.fn();
	},
}));

const env = { BOT_TOKEN: "test-token" } as Env;

describe("bot metadata", () => {
	beforeEach(() => {
		vi.resetModules();
		telegramMocks.setMyDescription.mockReset();
	});

	it("publishes the source repository in the Telegram bot description", async () => {
		telegramMocks.setMyDescription.mockResolvedValue(true);
		const { getBot } = await import("./bot");

		await getBot(env);

		expect(telegramMocks.setMyDescription).toHaveBeenCalledWith(
			expect.stringContaining("https://github.com/Eepu02/snapfluensseri"),
		);
	});

	it("continues initializing if Telegram rejects the description update", async () => {
		telegramMocks.setMyDescription.mockRejectedValue(
			new Error("API unavailable"),
		);
		const consoleError = vi
			.spyOn(console, "error")
			.mockImplementation(() => {});
		const { getBot } = await import("./bot");

		await expect(getBot(env)).resolves.toBeDefined();
		expect(consoleError).toHaveBeenCalledWith(
			expect.stringContaining("Unable to update bot description"),
		);

		consoleError.mockRestore();
	});
});
