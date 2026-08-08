import { describe, expect, it } from "vitest";
import type { Env } from "./db/client";
import worker from "./index";

const webhookRequest = (secret?: string) =>
	new Request("https://example.com/webhook", {
		method: "POST",
		headers: secret ? { "X-Telegram-Bot-Api-Secret-Token": secret } : undefined,
		body: "{}",
	});

describe("webhook authentication", () => {
	it("fails closed when the webhook secret is not configured", async () => {
		const response = await worker.fetch(webhookRequest(), {} as Env);

		expect(response.status).toBe(503);
	});

	it("rejects a request with the wrong webhook secret", async () => {
		const env = { TG_WEBHOOK_SECRET: "expected-secret" } as Env;
		const response = await worker.fetch(webhookRequest("wrong-secret"), env);

		expect(response.status).toBe(403);
	});
});
