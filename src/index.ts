import { getBot } from "./bot";
import { runCron } from "./cron";
import type { Env } from "./db/client";
import { formatErrorMessage } from "./utils/helpers";

export default {
	async fetch(req: Request, env: Env) {
		const url = new URL(req.url);

		if (req.method === "GET" && url.pathname === "/health") {
			return new Response("ok");
		}

		if (req.method === "POST" && url.pathname === "/webhook") {
			const secret = env.TG_WEBHOOK_SECRET;
			if (secret) {
				const got = req.headers.get("X-Telegram-Bot-Api-Secret-Token");
				if (got !== secret) return new Response("forbidden", { status: 403 });
			}

			const bot = await getBot(env);
			try {
				await bot.handleUpdate(await req.json());
			} catch (e) {
				console.log(`[FATAL BOT ERROR]: ${formatErrorMessage(e)}`);
			}
			// Always return ok to Telegram, otherwise it will retry the same update multiple times
			return new Response("ok");
		}

		return new Response("not found", { status: 404 });
	},

	async scheduled(
		controller: ScheduledController,
		env: Env,
		ctx: ExecutionContext,
	) {
		ctx.waitUntil(runCron(env, controller.scheduledTime));
	},
} satisfies ExportedHandler<Env>;
